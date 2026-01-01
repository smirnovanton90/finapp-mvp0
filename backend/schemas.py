from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal
from datetime import date
from typing import Optional

ItemKind = Literal["ASSET", "LIABILITY"]


class ItemCreate(BaseModel):
    kind: ItemKind
    type_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    initial_value_rub: int = Field(ge=0)

class ItemOut(BaseModel):
    id: int
    kind: ItemKind
    type_code: str
    name: str
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


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    level: int = Field(ge=1, le=3)
    parent_id: Optional[int] = None
    direction: Literal["INCOME", "EXPENSE", "BOTH"]


class CategoryCreate(CategoryBase):
    pass


class CategoryOut(CategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True