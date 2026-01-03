from datetime import datetime, date
from pydantic import BaseModel, Field, field_validator
from typing import Literal

ItemKind = Literal["ASSET", "LIABILITY"]


class ItemCreate(BaseModel):
    kind: ItemKind
    type_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    currency_code: str = Field(default="RUB", min_length=3, max_length=3)
    bank_id: int | None = None
    initial_value_rub: int = Field(ge=0)
    start_date: date

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
    pass

class TransactionOut(TransactionBase):
    id: int
    created_at: datetime

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


class BankOut(BaseModel):
    id: int
    ogrn: str
    name: str
    license_status: str
    logo_url: str | None

    class Config:
        from_attributes = True
