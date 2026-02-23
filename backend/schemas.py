import json
from datetime import datetime, date
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

ItemKind = Literal["ASSET", "LIABILITY"]
ItemHistoryStatus = Literal["NEW", "HISTORICAL"]
InterestPayoutOrder = Literal["END_OF_TERM", "MONTHLY"]
CardKind = Literal["DEBIT", "CREDIT"]
FirstPayoutRule = Literal["OPEN_DATE", "MONTH_END", "SHIFT_ONE_MONTH"]
RepaymentType = Literal["ANNUITY", "DIFFERENTIATED"]
PaymentAmountKind = Literal["TOTAL", "PRINCIPAL"]
TransactionDirection = Literal["INCOME", "EXPENSE", "TRANSFER"]
TransactionType = Literal["ACTUAL", "PLANNED"]
TransactionStatus = Literal["CONFIRMED", "UNCONFIRMED", "REALIZED"]
TransactionChainFrequency = Literal["DAILY", "WEEKLY", "MONTHLY", "REGULAR"]
TransactionChainMonthlyRule = Literal["FIRST_DAY", "LAST_DAY"]
TransactionChainSource = Literal["AUTO_ITEM", "MANUAL"]
TransactionChainPurpose = Literal["INTEREST", "PRINCIPAL"]
PrimaryValueKind = Literal["BALANCE", "ACQUISITION", "INVESTED", "MARKET"]
AssetLinkType = Literal[
    "ASSET_PURCHASE",
    "ASSET_INVESTMENT",
    "ASSET_EXPENSE",
    "ASSET_SALE",
    "ASSET_INCOME",
]
CategoryScope = Literal["INCOME", "EXPENSE", "BOTH"]
LimitPeriod = Literal["MONTHLY", "WEEKLY", "YEARLY", "CUSTOM"]
GoalPeriod = LimitPeriod
CounterpartyType = Literal["LEGAL", "PERSON"]
OnboardingDeviceType = Literal["WEB", "MOBILE"]
OnboardingStatus = Literal["PENDING", "POSTPONED", "IN_PROGRESS", "COMPLETED", "SKIPPED"]


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

class UserMeOut(BaseModel):
    id: int
    login: str | None
    email: str | None
    name: str | None
    first_name: str | None
    last_name: str | None
    birth_date: date | None
    photo_url: str | None
    accounting_start_date: date | None
    google_sub: str | None
    telegram_chat_id: int | None = None
    telegram_notify_hour: int | None = None
    telegram_notify_minute: int | None = None
    telegram_notify_enabled: bool = True

    class Config:
        from_attributes = True


class TelegramLinkCodeOut(BaseModel):
    code: str
    expires_at: datetime


class TelegramStatusOut(BaseModel):
    linked: bool
    telegram_chat_id: int | None = None
    notify_time: str  # "HH:MM"
    notify_enabled: bool

class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    birth_date: date | None = None

class AccountingStartDateUpdate(BaseModel):
    accounting_start_date: date


class ItemCloseRequest(BaseModel):
    close_cards: bool = False
    closing_date: date | None = None
    transfer_to_item_id: int | None = None
    write_off: bool = False

    @model_validator(mode="after")
    def validate_closing_options(self) -> "ItemCloseRequest":
        if self.write_off and self.transfer_to_item_id is not None:
            raise ValueError("Cannot specify both write_off and transfer_to_item_id")
        return self


class OnboardingStateOut(BaseModel):
    device_type: OnboardingDeviceType
    status: OnboardingStatus

    class Config:
        from_attributes = True


class OnboardingStateUpdate(BaseModel):
    device_type: OnboardingDeviceType
    status: OnboardingStatus


class ItemPlanSettingsBase(BaseModel):
    enabled: bool = False
    first_payout_rule: FirstPayoutRule | None = None
    plan_end_date: date | None = None
    loan_end_date: date | None = None
    repayment_frequency: TransactionChainFrequency | None = None
    repayment_weekly_day: int | None = Field(default=None, ge=0, le=6)
    repayment_monthly_day: int | None = Field(default=None, ge=1, le=31)
    repayment_monthly_rule: TransactionChainMonthlyRule | None = None
    repayment_interval_days: int | None = Field(default=None, ge=1)
    repayment_account_id: int | None = None
    repayment_type: RepaymentType | None = None
    payment_amount_kind: PaymentAmountKind | None = None
    payment_amount_rub: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_repayment_frequency_details(self) -> "ItemPlanSettingsBase":
        if self.repayment_frequency is None:
            if (
                self.repayment_weekly_day is not None
                or self.repayment_monthly_day is not None
                or self.repayment_monthly_rule is not None
                or self.repayment_interval_days is not None
            ):
                raise ValueError("repayment frequency details require repayment_frequency")
            return self

        if self.repayment_frequency == "WEEKLY":
            if self.repayment_weekly_day is None:
                raise ValueError("repayment_weekly_day is required for WEEKLY frequency")
            if (
                self.repayment_monthly_day is not None
                or self.repayment_monthly_rule is not None
                or self.repayment_interval_days is not None
            ):
                raise ValueError("monthly fields are not allowed for WEEKLY frequency")
        elif self.repayment_frequency == "MONTHLY":
            if self.repayment_weekly_day is not None:
                raise ValueError("repayment_weekly_day is only allowed for WEEKLY frequency")
            if (
                self.repayment_monthly_day is not None
                and self.repayment_monthly_rule is not None
            ):
                raise ValueError(
                    "repayment_monthly_day and repayment_monthly_rule cannot be used together"
                )
            if self.repayment_monthly_day is None and self.repayment_monthly_rule is None:
                raise ValueError(
                    "repayment_monthly_day or repayment_monthly_rule is required for MONTHLY frequency"
                )
            if self.repayment_interval_days is not None:
                raise ValueError("repayment_interval_days is not allowed for MONTHLY frequency")
        elif self.repayment_frequency == "REGULAR":
            if self.repayment_interval_days is None:
                raise ValueError("repayment_interval_days is required for REGULAR frequency")
            if (
                self.repayment_weekly_day is not None
                or self.repayment_monthly_day is not None
                or self.repayment_monthly_rule is not None
            ):
                raise ValueError("weekly/monthly fields are not allowed for REGULAR frequency")
        else:
            if (
                self.repayment_weekly_day is not None
                or self.repayment_monthly_day is not None
                or self.repayment_monthly_rule is not None
                or self.repayment_interval_days is not None
            ):
                raise ValueError("weekly/monthly/interval fields are not allowed for DAILY frequency")

        if self.payment_amount_rub is not None and self.payment_amount_kind is None:
            raise ValueError("payment_amount_kind is required when payment_amount_rub is provided")
        return self


class ItemCreate(BaseModel):
    kind: ItemKind
    type_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    currency_code: str = Field(default="RUB", min_length=3, max_length=3)
    counterparty_id: int | None = None
    open_date: date
    opening_counterparty_item_id: int | None = None
    account_last7: str | None = Field(default=None, min_length=7, max_length=7, pattern=r"^\d{7}$")
    contract_number: str | None = Field(default=None, max_length=100)
    card_last4: str | None = Field(default=None, min_length=4, max_length=4, pattern=r"^\d{4}$")
    card_account_id: int | None = None
    card_kind: CardKind | None = None
    credit_limit: int | None = Field(default=None, ge=0)
    deposit_term_days: int | None = Field(default=None, ge=1)
    interest_rate: float | None = Field(default=None, ge=0)
    interest_payout_order: InterestPayoutOrder | None = None
    interest_capitalization: bool | None = None
    interest_payout_account_id: int | None = None
    instrument_id: str | None = None
    instrument_board_id: str | None = None
    position_lots: int | None = Field(default=None, ge=0)
    quantity_units: float | None = Field(default=None, ge=0)
    opening_price_cents: int | None = Field(default=None, ge=0)
    commission_enabled: bool | None = None
    commission_amount_rub: int | None = Field(default=None, ge=0)
    commission_payment_item_id: int | None = None
    initial_value_rub: int
    plan_settings: ItemPlanSettingsBase | None = None
    synonyms: list[str] | None = None
    primary_value_kind: PrimaryValueKind | None = None

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
    def validate_counterparty_fields(self) -> "ItemCreate":
        bank_account_types = {"bank_account", "savings_account"}
        contract_number_types = {"bank_account", "bank_card", "deposit", "savings_account"}
        loan_types = {
            "loan_to_third_party",
            "third_party_receivables",
            "credit_card_debt",
            "consumer_loan",
            "mortgage",
            "car_loan",
            "education_loan",
            "installment",
            "microloan",
            "private_loan",
            "third_party_payables",
        }
        card_types = {"bank_card"}
        deposit_types = {"deposit"}
        interest_rate_types = {
            "deposit",
            "savings_account",
            "loan_to_third_party",
            "third_party_receivables",
            "credit_card_debt",
            "consumer_loan",
            "mortgage",
            "car_loan",
            "education_loan",
            "installment",
            "microloan",
            "private_loan",
            "third_party_payables",
        }
        interest_details_types = {"deposit", "savings_account"}

        if self.account_last7 is not None and self.type_code not in bank_account_types:
            raise ValueError("account_last7 is only allowed for bank_account or savings_account")

        if self.contract_number is not None and self.type_code not in contract_number_types:
            raise ValueError("contract_number is only allowed for bank-related assets")

        if self.card_last4 is not None and self.type_code not in card_types:
            raise ValueError("card_last4 is only allowed for bank_card")

        if self.card_account_id is not None and self.type_code not in card_types:
            raise ValueError("card_account_id is only allowed for bank_card")

        if self.card_kind is not None and self.type_code not in card_types:
            raise ValueError("card_kind is only allowed for bank_card")

        if self.credit_limit is not None and self.type_code not in card_types:
            raise ValueError("credit_limit is only allowed for bank_card")

        if self.deposit_term_days is not None and self.type_code not in deposit_types:
            raise ValueError("deposit_term_days is only allowed for deposit")

        if self.interest_rate is not None and self.type_code not in interest_rate_types:
            raise ValueError(
                "interest_rate is only allowed for deposit, savings_account, or loan types"
            )

        if (
            self.interest_payout_order is not None
            or self.interest_capitalization is not None
            or self.interest_payout_account_id is not None
        ) and self.type_code not in interest_details_types:
            raise ValueError(
                "interest payout fields are only allowed for deposit or savings_account"
            )

        if self.type_code in card_types:
            if self.kind != "ASSET":
                raise ValueError("bank_card kind must be ASSET")
            if self.card_kind is None:
                self.card_kind = "DEBIT"
            if self.card_kind == "CREDIT":
                if self.card_account_id is not None:
                    raise ValueError("card_account_id is not allowed for credit bank_card")
                if self.credit_limit is None:
                    raise ValueError("credit_limit is required for credit bank_card")
                if self.initial_value_rub < -self.credit_limit:
                    raise ValueError("initial_value_rub cannot be below credit_limit")
            else:
                if self.credit_limit is not None:
                    raise ValueError("credit_limit is only allowed for credit bank_card")
                if self.initial_value_rub < 0:
                    raise ValueError("initial_value_rub must be non-negative")
        else:
            if self.initial_value_rub < 0:
                raise ValueError("initial_value_rub must be non-negative")
        return self

    @field_validator("synonyms", mode="before")
    @classmethod
    def normalize_item_synonyms(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            result = []
            for item in value:
                if isinstance(item, str):
                    s = item.strip()
                    if s:
                        if len(s) > 300:
                            raise ValueError("Каждый синоним не должен превышать 300 символов.")
                        result.append(s)
            if len(result) > 50:
                raise ValueError("Не более 50 синонимов.")
            return result
        return []


class ItemOut(BaseModel):
    id: int
    kind: ItemKind
    type_code: str
    name: str
    synonyms: list[str] = []
    currency_code: str
    counterparty_id: int | None
    open_date: date
    opening_counterparty_item_id: int | None
    account_last7: str | None
    contract_number: str | None
    card_last4: str | None
    card_account_id: int | None
    card_kind: CardKind | None
    credit_limit: int | None
    deposit_term_days: int | None
    deposit_end_date: date | None
    interest_rate: float | None
    interest_payout_order: InterestPayoutOrder | None
    interest_capitalization: bool | None
    interest_payout_account_id: int | None
    instrument_id: str | None
    instrument_board_id: str | None
    position_lots: int | None
    lot_size: int | None
    face_value_cents: int | None
    quantity_units: float | None = None
    initial_value_rub: int
    current_value_rub: int
    start_date: date
    history_status: ItemHistoryStatus
    created_at: datetime
    closed_at: datetime | None
    archived_at: datetime | None
    plan_settings: ItemPlanSettingsBase | None = None
    photo_url: str | None = None
    photo_updated_at: datetime | None = None
    primary_value_kind: PrimaryValueKind | None = None
    """Последняя рыночная стоимость в рублях (копейки), для primary_value_kind=MARKET. Заполняется в list/get."""
    latest_market_value_rub: int | None = None
    """Эквивалент рыночной стоимости в рублях (копейки). Справа на карточке при валюте != RUB."""
    latest_market_value_currency_cents: int | None = None
    """Рыночная стоимость в валюте актива (центы), когда валюта не RUB. Слева на карточке."""
    acquisition_rub: int | None = None
    """Стоимость приобретения (копейки), из транзакций ASSET_PURCHASE. Заполняется в list/get."""
    invested_rub: int | None = None
    """Стоимость вложенных средств (копейки), acquisition + ASSET_INVESTMENT. Заполняется в list/get."""

    @field_validator("synonyms", mode="before")
    @classmethod
    def ensure_item_synonyms_list(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []

    class Config:
        from_attributes = True


class ItemSynonymsAdd(BaseModel):
    add: list[str] = Field(default_factory=list)

    @field_validator("add", mode="before")
    @classmethod
    def normalize_add(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            result = []
            for item in value:
                if isinstance(item, str):
                    s = item.strip()
                    if s:
                        if len(s) > 300:
                            raise ValueError("Каждый синоним не должен превышать 300 символов.")
                        result.append(s)
            if len(result) > 50:
                raise ValueError("Не более 50 синонимов для добавления.")
            return result
        return []


class ItemMarketValueCreate(BaseModel):
    value_date: date
    value_rub: int = Field(..., ge=0)


class ItemMarketValueOut(BaseModel):
    id: int
    item_id: int
    value_date: date
    value_rub: int
    created_at: datetime

    class Config:
        from_attributes = True


class ItemCostsOut(BaseModel):
    """Four cost types for an item (all in kopecks)."""

    balance_rub: int
    acquisition_rub: int
    invested_rub: int
    market_rub: int | None
    """Рыночная стоимость в валюте актива (центы/копейки). Для RUB — копейки, для USD — центы."""
    market_value_rub: int | None = None
    """Эквивалент рыночной стоимости в рублях (копейки)."""
    # Суммы фактических транзакций по типу связи с активом (копейки)
    income_rub: int = 0   # ASSET_INCOME
    expense_rub: int = 0  # ASSET_EXPENSE


class ItemCostHistoryPoint(BaseModel):
    """One day in cost history (all in kopecks)."""

    date: str  # YYYY-MM-DD
    balance_rub: int
    acquisition_rub: int
    invested_rub: int
    market_rub: int | None
    # Для графика рыночной стоимости: количество единиц и цена за единицу на эту дату (MOEX)
    market_quantity_units: int | None = None
    market_price_rub: int | None = None  # копейки за одну единицу


class ItemCostHistoryOut(BaseModel):
    """Time series of cost types for charting."""

    points: list[ItemCostHistoryPoint]


class TransactionBase(BaseModel):
    transaction_date: datetime
    primary_item_id: int
    counterparty_item_id: int | None = None
    counterparty_id: int | None = None
    amount_rub: int = Field(ge=0)
    amount_counterparty: int | None = Field(default=None, ge=0)
    primary_quantity_lots: int | None = Field(default=None, ge=0)
    counterparty_quantity_lots: int | None = Field(default=None, ge=0)
    primary_quantity_units: float | None = Field(default=None, ge=0)
    direction: TransactionDirection
    transaction_type: TransactionType
    category_id: int | None = None
    comment: str | None = None
    related_item_id: int | None = None
    asset_link_type: AssetLinkType | None = None

    @model_validator(mode="after")
    def validate_category_for_direction(self) -> "TransactionBase":
        if self.direction == "TRANSFER":
            if self.category_id is not None:
                raise ValueError("category_id is not allowed for TRANSFER")
        return self

    # No asset_link_type vs direction validation here: used for response (TransactionOut)
    # where legacy data may have any stored values. Validation only in TransactionCreate.

class TransactionCreate(TransactionBase):
    status: TransactionStatus | None = None

    @model_validator(mode="after")
    def validate_asset_link_input(self) -> "TransactionCreate":
        if self.asset_link_type is not None:
            if self.related_item_id is None:
                raise ValueError("related_item_id is required when asset_link_type is set")
            if self.direction == "EXPENSE" and self.asset_link_type not in (
                "ASSET_PURCHASE",
                "ASSET_INVESTMENT",
                "ASSET_EXPENSE",
            ):
                raise ValueError(
                    "asset_link_type for EXPENSE must be ASSET_PURCHASE, ASSET_INVESTMENT or ASSET_EXPENSE"
                )
            if self.direction == "INCOME" and self.asset_link_type not in (
                "ASSET_SALE",
                "ASSET_INCOME",
            ):
                raise ValueError(
                    "asset_link_type for INCOME must be ASSET_SALE or ASSET_INCOME"
                )
            if self.direction == "TRANSFER":
                raise ValueError("asset_link_type is not allowed for TRANSFER")
        return self


DebtDirection = Literal["I_PAID", "THEY_PAID"]


class TransactionDebtsCreate(BaseModel):
    """Payload for creating a «Долги» (debts) transaction — transfer to/from Взаиморасчёты."""

    debt_direction: DebtDirection
    counterparty_id: int  # Used for Взаиморасчёты (settlements item)
    transaction_counterparty_id: int | None = None  # If set, used as transaction counterparty (e.g. «Где платите»); otherwise same as counterparty_id
    primary_item_id: int = Field(..., description="User-selected asset/liability (source or target)")
    transaction_date: datetime
    amount_rub: int = Field(..., ge=1)
    transaction_type: TransactionType = "ACTUAL"
    comment: str | None = None
    status: TransactionStatus | None = None


class TransactionTheyPaidForMeCreate(BaseModel):
    """Payload for «Кто-то заплатил за меня» — expense from Взаиморасчёты (who paid) with counterparty (where paid)."""

    who_paid_counterparty_id: int
    where_paid_counterparty_id: int
    amount_rub: int = Field(..., ge=1)
    transaction_date: datetime | None = None
    category_id: int | None = None
    comment: str | None = None


class TransactionOut(TransactionBase):
    id: int
    status: TransactionStatus
    created_at: datetime
    chain_id: int | None = None
    chain_name: str | None = None
    primary_card_item_id: int | None = None
    counterparty_card_item_id: int | None = None
    deleted_at: datetime | None = None
    related_item_id: int | None = None
    source: str | None = None

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
    counterparty_id: int | None = None
    amount_rub: int = Field(ge=0)
    amount_counterparty: int | None = Field(default=None, ge=0)
    direction: TransactionDirection
    category_id: int | None = None
    comment: str | None = None
    related_item_id: int | None = None

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
    primary_card_item_id: int | None = None
    counterparty_card_item_id: int | None = None
    counterparty_id: int | None
    amount_rub: int
    amount_counterparty: int | None
    direction: TransactionDirection
    category_id: int | None
    comment: str | None
    deleted_at: datetime | None
    created_at: datetime
    related_item_id: int | None = None
    source: TransactionChainSource | None = None
    purpose: TransactionChainPurpose | None = None
    amount_is_variable: bool | None = None
    amount_min_rub: int | None = None
    amount_max_rub: int | None = None

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


# Цели (Goals) — публичный API и схема (алиасы для лимитов)
GoalBase = LimitBase
GoalCreate = LimitCreate
GoalOut = LimitOut


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: int | None = None
    scope: CategoryScope
    icon_name: str | None = Field(default=None, max_length=50)
    synonyms: list[str] | None = None

    @field_validator("synonyms", mode="before")
    @classmethod
    def normalize_category_synonyms(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            result = []
            for item in value:
                if isinstance(item, str):
                    s = item.strip()
                    if s:
                        if len(s) > 300:
                            raise ValueError("Каждый синоним не должен превышать 300 символов.")
                        result.append(s)
            if len(result) > 50:
                raise ValueError("Не более 50 синонимов.")
            return result
        return []


class CategoryScopeUpdate(BaseModel):
    scope: CategoryScope


class CategoryVisibilityUpdate(BaseModel):
    enabled: bool


class CategoryIconUpdate(BaseModel):
    icon_name: str | None = Field(default=None, max_length=50)


class CategorySynonymsUpdate(BaseModel):
    synonyms: list[str] = Field(default_factory=list)

    @field_validator("synonyms", mode="before")
    @classmethod
    def normalize_synonyms(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            result = []
            for item in value:
                if isinstance(item, str):
                    s = item.strip()
                    if s:
                        if len(s) > 300:
                            raise ValueError("Каждый синоним не должен превышать 300 символов.")
                        result.append(s)
            if len(result) > 50:
                raise ValueError("Не более 50 синонимов.")
            return result
        return []


class CategorySynonymsAdd(BaseModel):
    add: list[str] = Field(default_factory=list)

    @field_validator("add", mode="before")
    @classmethod
    def normalize_add(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            result = []
            for item in value:
                if isinstance(item, str):
                    s = item.strip()
                    if s:
                        if len(s) > 300:
                            raise ValueError("Каждый синоним не должен превышать 300 символов.")
                        result.append(s)
            if len(result) > 50:
                raise ValueError("Не более 50 синонимов для добавления.")
            return result
        return []


class CategoryOut(BaseModel):
    id: int
    name: str
    scope: CategoryScope
    icon_name: str | None
    parent_id: int | None
    owner_user_id: int | None
    enabled: bool
    archived_at: datetime | None
    photo_url: str | None = None
    photo_updated_at: datetime | None = None
    children: list["CategoryOut"] = []
    synonyms: list[str] = []

    @field_validator("synonyms", mode="before")
    @classmethod
    def ensure_category_synonyms_list(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []

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


class MarketInstrumentOut(BaseModel):
    secid: str
    provider: str
    isin: str | None
    short_name: str | None
    name: str | None
    type_code: str | None
    engine: str | None
    market: str | None
    default_board_id: str | None
    currency_code: str | None
    lot_size: int | None
    face_value_cents: int | None
    is_traded: bool | None

    class Config:
        from_attributes = True


class MarketBoardOut(BaseModel):
    board_id: str
    title: str | None
    engine: str | None
    market: str | None
    currency_code: str | None
    is_primary: bool | None


class MarketInstrumentDetailsOut(BaseModel):
    instrument: MarketInstrumentOut
    boards: list[MarketBoardOut]


class MarketPriceOut(BaseModel):
    instrument_id: str
    board_id: str
    price_date: date
    price_time: datetime | None
    price_cents: int | None
    price_percent_bp: int | None
    accint_cents: int | None
    yield_bp: int | None
    currency_code: str | None
    price_usd_cents: int | None = None  # для крипты: цена в центах USD


class FxRatesBatchRequest(BaseModel):
    dates: list[str] = Field(min_length=1)


class BankOut(BaseModel):
    id: int
    inn: str
    name: str
    license_status: str
    logo_url: str | None

    class Config:
        from_attributes = True


class CounterpartyIndustryOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


MAX_SYNONYM_LENGTH = 300
MAX_SYNONYMS_COUNT = 50


class CounterpartyBase(BaseModel):
    entity_type: CounterpartyType
    industry_id: int | None = Field(default=None, ge=1)
    name: str | None = Field(default=None, max_length=300)
    full_name: str | None = Field(default=None, max_length=300)
    legal_form: str | None = Field(default=None, max_length=200)
    inn: str | None = Field(default=None, max_length=12)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    synonyms: list[str] | None = Field(default=None, max_length=MAX_SYNONYMS_COUNT)

    @field_validator(
        "name",
        "full_name",
        "legal_form",
        "inn",
        "first_name",
        "last_name",
        "middle_name",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value

    @field_validator("synonyms", mode="before")
    @classmethod
    def normalize_synonyms(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except Exception:
                return []
        if not isinstance(value, list):
            return []
        result = []
        for item in value:
            if isinstance(item, str):
                s = item.strip()
                if s:
                    if len(s) > MAX_SYNONYM_LENGTH:
                        raise ValueError(
                            f"Каждый синоним не должен превышать {MAX_SYNONYM_LENGTH} символов."
                        )
                    result.append(s)
        if len(result) > MAX_SYNONYMS_COUNT:
            raise ValueError(
                f"Не более {MAX_SYNONYMS_COUNT} синонимов на контрагента."
            )
        return result


class CounterpartyCreate(CounterpartyBase):
    pass


class CounterpartyUpdate(CounterpartyBase):
    pass


class CounterpartyOut(CounterpartyBase):
    id: int
    license_status: str | None
    logo_url: str | None
    photo_url: str | None
    owner_user_id: int | None
    created_at: datetime
    deleted_at: datetime | None

    @field_validator("synonyms", mode="before")
    @classmethod
    def ensure_synonyms_list(cls, value: object) -> list[str]:
        """При чтении из ORM гарантировать список (на случай None или строки из БД)."""
        if value is None:
            return []
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, list) else []
            except Exception:
                return []
        if isinstance(value, list):
            return value
        return []

    class Config:
        from_attributes = True


class CounterpartyPageOut(BaseModel):
    items: list[CounterpartyOut]
    next_cursor: str | None = None
    has_more: bool


class LegalFormOut(BaseModel):
    code: str
    label: str


class ReceiptRecognizeOut(BaseModel):
    """Результат распознавания чека (OCR): ИНН, дата, сумма, сырой текст и контрагент при совпадении."""

    inn: str | None = None
    transaction_date: str | None = None  # YYYY-MM-DD
    amount_rub: int | None = None  # в копейках
    raw_text: str | None = None
    counterparty: CounterpartyOut | None = None
