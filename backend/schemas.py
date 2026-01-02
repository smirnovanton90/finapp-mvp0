from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal
from datetime import date

ItemKind = Literal["ASSET", "LIABILITY"]


class ItemCreate(BaseModel):
    kind: ItemKind
    type_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    currency_code: str = Field(default="RUB", min_length=3, max_length=3)
    initial_value_rub: int = Field(ge=0)

class ItemOut(BaseModel):
    id: int
    kind: ItemKind
    type_code: str
    name: str
    currency_code: str
    initial_value_rub: int
    current_value_rub: int
    created_at: datetime
    archived_at: datetime | None

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    transaction_date: date
    primary_item_id: int
    counterparty_item_id: int | None = None
    amount_rub: int
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
