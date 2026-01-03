from datetime import datetime, date
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

ItemKind = Literal["ASSET", "LIABILITY"]
InterestPayoutOrder = Literal["END_OF_TERM", "MONTHLY"]
TransactionStatus = Literal["CONFIRMED", "UNCONFIRMED"]


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
    archived_at: datetime | None

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    transaction_date: date
    primary_item_id: int
    counterparty_item_id: int | None = None
    amount_rub: int = Field(ge=0)
    amount_counterparty: int | None = Field(default=None, ge=0)
    direction: str
    transaction_type: str
    category_l1: str
    category_l2: str
    category_l3: str
    description: str | None = None
    comment: str | None = None

class TransactionCreate(TransactionBase):
    status: TransactionStatus | None = None

class TransactionOut(TransactionBase):
    id: int
    status: TransactionStatus
    created_at: datetime

    class Config:
        from_attributes = True

class TransactionStatusUpdate(BaseModel):
    status: TransactionStatus


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


class BankOut(BaseModel):
    id: int
    ogrn: str
    name: str
    license_status: str
    logo_url: str | None

    class Config:
        from_attributes = True
