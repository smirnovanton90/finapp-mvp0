from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal


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