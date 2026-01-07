from datetime import datetime, date
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

ItemKind = Literal["ASSET", "LIABILITY"]
InterestPayoutOrder = Literal["END_OF_TERM", "MONTHLY"]
TransactionDirection = Literal["INCOME", "EXPENSE", "TRANSFER"]
TransactionType = Literal["ACTUAL", "PLANNED"]
TransactionStatus = Literal["CONFIRMED", "UNCONFIRMED", "REALIZED"]
TransactionChainFrequency = Literal["DAILY", "WEEKLY", "MONTHLY", "REGULAR"]
TransactionChainMonthlyRule = Literal["FIRST_DAY", "LAST_DAY"]
CategoryScope = Literal["INCOME", "EXPENSE", "BOTH"]
LimitPeriod = Literal["MONTHLY", "WEEKLY", "YEARLY", "CUSTOM"]


class AuthRegister(BaseModel):
    login: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=200)

    @field_validator("login", mode="before")
    @classmethod
    def normalize_login(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned.lower()
        return value

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class AuthLogin(BaseModel):
    login: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("login", mode="before")
    @classmethod
    def normalize_login(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned.lower()
        return value


class AuthUserOut(BaseModel):
    id: int
    login: str
    name: str | None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    user: AuthUserOut


class ItemCreate(BaseModel):
    kind: ItemKind
    type_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    currency_code: str = Field(default="RUB", min_length=3, max_length=3)
    bank_id: int | None = None
    open_date: date | None = None
    account_last7: str | None = Field(default=None, min_length=7, max_length=7, pattern=r"^\d{7}$")
    contract_number: str | None = Field(default=None, max_length=100)
    card_last4: str | None = Field(default=None, min_length=4, max_length=4, pattern=r"^\d{4}$")
    card_account_id: int | None = None
    deposit_term_days: int | None = Field(default=None, ge=1)
    interest_rate: float | None = Field(default=None, ge=0)
    interest_payout_order: InterestPayoutOrder | None = None
    interest_capitalization: bool | None = None
    interest_payout_account_id: int | None = None
    initial_value_rub: int = Field(ge=0)
    start_date: date

    @field_validator("account_last7", "contract_number", "card_last4", mode="before")
    @classmethod
    def normalize_optional_strings(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value

    @model_validator(mode="after")
    def validate_bank_account_fields(self) -> "ItemCreate":
        bank_account_types = {"bank_account", "savings_account"}
        contract_number_types = {"bank_account", "bank_card", "deposit", "savings_account"}
        open_date_types = {"bank_account", "deposit", "savings_account"}
        card_types = {"bank_card"}
        deposit_types = {"deposit"}
        interest_types = {"deposit", "savings_account"}

        if self.account_last7 is not None and self.type_code not in bank_account_types:
            raise ValueError("account_last7 is only allowed for bank_account or savings_account")

        if self.contract_number is not None and self.type_code not in contract_number_types:
            raise ValueError("contract_number is only allowed for bank-related assets")

        if self.open_date is not None and self.type_code not in open_date_types:
            raise ValueError("open_date is only allowed for bank_account, deposit, or savings_account")

        if self.card_last4 is not None and self.type_code not in card_types:
            raise ValueError("card_last4 is only allowed for bank_card")

        if self.card_account_id is not None and self.type_code not in card_types:
            raise ValueError("card_account_id is only allowed for bank_card")

        if self.deposit_term_days is not None and self.type_code not in deposit_types:
            raise ValueError("deposit_term_days is only allowed for deposit")

        if self.deposit_term_days is not None and self.open_date is None:
            raise ValueError("open_date is required when deposit_term_days is provided")

        if (
            self.interest_rate is not None
            or self.interest_payout_order is not None
            or self.interest_capitalization is not None
            or self.interest_payout_account_id is not None
        ) and self.type_code not in interest_types:
            raise ValueError("interest fields are only allowed for deposit or savings_account")
        return self

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Дата начала действия не может быть позже сегодняшней даты.")
        return value

class ItemOut(BaseModel):
    id: int
    kind: ItemKind
    type_code: str
    name: str
    currency_code: str
    bank_id: int | None
    open_date: date | None
    account_last7: str | None
    contract_number: str | None
    card_last4: str | None
    card_account_id: int | None
    deposit_term_days: int | None
    deposit_end_date: date | None
    interest_rate: float | None
    interest_payout_order: InterestPayoutOrder | None
    interest_capitalization: bool | None
    interest_payout_account_id: int | None
    initial_value_rub: int
    current_value_rub: int
    start_date: date
    created_at: datetime
    closed_at: datetime | None
    archived_at: datetime | None

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    transaction_date: datetime
    primary_item_id: int
    counterparty_item_id: int | None = None
    amount_rub: int = Field(ge=0)
    amount_counterparty: int | None = Field(default=None, ge=0)
    direction: TransactionDirection
    transaction_type: TransactionType
    category_id: int | None = None
    description: str | None = None
    comment: str | None = None

    @model_validator(mode="after")
    def validate_category_for_direction(self) -> "TransactionBase":
        if self.direction == "TRANSFER":
            if self.category_id is not None:
                raise ValueError("category_id is not allowed for TRANSFER")
        else:
            if self.category_id is None:
                raise ValueError("category_id is required for INCOME/EXPENSE")
        return self

class TransactionCreate(TransactionBase):
    status: TransactionStatus | None = None

class TransactionOut(TransactionBase):
    id: int
    status: TransactionStatus
    created_at: datetime
    chain_id: int | None = None
    chain_name: str | None = None
    deleted_at: datetime | None = None

    class Config:
        from_attributes = True

class TransactionPageOut(BaseModel):
    items: list[TransactionOut]
    next_cursor: str | None = None
    has_more: bool

class TransactionStatusUpdate(BaseModel):
    status: TransactionStatus


class TransactionChainCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    frequency: TransactionChainFrequency
    weekly_day: int | None = Field(default=None, ge=0, le=6)
    monthly_day: int | None = Field(default=None, ge=1, le=31)
    monthly_rule: TransactionChainMonthlyRule | None = None
    interval_days: int | None = Field(default=None, ge=1)
    primary_item_id: int
    counterparty_item_id: int | None = None
    amount_rub: int = Field(ge=0)
    amount_counterparty: int | None = Field(default=None, ge=0)
    direction: TransactionDirection
    category_id: int | None = None
    description: str | None = None
    comment: str | None = None

    @model_validator(mode="after")
    def validate_frequency_details(self) -> "TransactionChainCreate":
        if self.direction == "TRANSFER":
            if self.category_id is not None:
                raise ValueError("category_id is not allowed for TRANSFER")
        else:
            if self.category_id is None:
                raise ValueError("category_id is required for INCOME/EXPENSE")

        if self.start_date > self.end_date:
            raise ValueError("start_date must not be later than end_date")

        if self.frequency == "WEEKLY":
            if self.weekly_day is None:
                raise ValueError("weekly_day is required for WEEKLY frequency")
            if (
                self.monthly_day is not None
                or self.monthly_rule is not None
                or self.interval_days is not None
            ):
                raise ValueError("monthly fields are not allowed for WEEKLY frequency")
        elif self.frequency == "MONTHLY":
            if self.weekly_day is not None:
                raise ValueError("weekly_day is only allowed for WEEKLY frequency")
            if self.monthly_day is not None and self.monthly_rule is not None:
                raise ValueError("monthly_day and monthly_rule cannot be used together")
            if self.monthly_day is None and self.monthly_rule is None:
                raise ValueError("monthly_day or monthly_rule is required for MONTHLY frequency")
            if self.interval_days is not None:
                raise ValueError("interval_days is not allowed for MONTHLY frequency")
        elif self.frequency == "REGULAR":
            if self.interval_days is None:
                raise ValueError("interval_days is required for REGULAR frequency")
            if (
                self.weekly_day is not None
                or self.monthly_day is not None
                or self.monthly_rule is not None
            ):
                raise ValueError("weekly/monthly fields are not allowed for REGULAR frequency")
        else:
            if (
                self.weekly_day is not None
                or self.monthly_day is not None
                or self.monthly_rule is not None
                or self.interval_days is not None
            ):
                raise ValueError("weekly/monthly/interval fields are not allowed for DAILY frequency")

        return self


class TransactionChainOut(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    frequency: TransactionChainFrequency
    weekly_day: int | None
    monthly_day: int | None
    monthly_rule: TransactionChainMonthlyRule | None
    interval_days: int | None
    primary_item_id: int
    counterparty_item_id: int | None
    amount_rub: int
    amount_counterparty: int | None
    direction: TransactionDirection
    category_id: int | None
    description: str | None
    comment: str | None
    deleted_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class LimitBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    period: LimitPeriod
    category_id: int
    amount_rub: int = Field(ge=0)
    custom_start_date: date | None = None
    custom_end_date: date | None = None

    @model_validator(mode="after")
    def validate_custom_period(self) -> "LimitBase":
        if self.period == "CUSTOM":
            if self.custom_start_date is None or self.custom_end_date is None:
                raise ValueError(
                    "custom_start_date and custom_end_date are required for CUSTOM period"
                )
            if self.custom_start_date > self.custom_end_date:
                raise ValueError("custom_start_date must be on or before custom_end_date")
        else:
            if self.custom_start_date is not None or self.custom_end_date is not None:
                raise ValueError(
                    "custom_start_date/custom_end_date are only allowed for CUSTOM period"
                )
        return self


class LimitCreate(LimitBase):
    pass


class LimitOut(LimitBase):
    id: int
    created_at: datetime
    deleted_at: datetime | None

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: int | None = None
    scope: CategoryScope
    icon_name: str | None = Field(default=None, max_length=50)


class CategoryScopeUpdate(BaseModel):
    scope: CategoryScope


class CategoryVisibilityUpdate(BaseModel):
    enabled: bool


class CategoryIconUpdate(BaseModel):
    icon_name: str | None = Field(default=None, max_length=50)


class CategoryOut(BaseModel):
    id: int
    name: str
    scope: CategoryScope
    icon_name: str | None
    parent_id: int | None
    owner_user_id: int | None
    enabled: bool
    archived_at: datetime | None
    children: list["CategoryOut"] = []

    class Config:
        from_attributes = True


class CurrencyOut(BaseModel):
    iso_char_code: str
    iso_num_code: str
    nominal: int
    name: str
    eng_name: str

    class Config:
        from_attributes = True


class FxRateOut(BaseModel):
    char_code: str
    nominal: int
    value: float
    rate: float


class FxRatesBatchRequest(BaseModel):
    dates: list[str] = Field(min_length=1)


class BankOut(BaseModel):
    id: int
    ogrn: str
    name: str
    license_status: str
    logo_url: str | None

    class Config:
        from_attributes = True
