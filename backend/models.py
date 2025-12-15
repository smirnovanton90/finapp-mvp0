from sqlalchemy import String, DateTime, BigInteger, CheckConstraint, func, ForeignKey, Date, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db import Base
from datetime import datetime, date
from typing import Optional


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    google_sub: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    items: Mapped[list["Item"]] = relationship(back_populates="user")

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    user: Mapped[User] = relationship(back_populates="items")

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    type_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    initial_value_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_value_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)
    
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    archived_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("kind in ('ASSET','LIABILITY')", name="ck_items_kind"),
        CheckConstraint("initial_value_rub >= 0", name="ck_items_initial_non_negative"),
        CheckConstraint("current_value_rub >= 0", name="ck_items_current_non_negative"),
    )
class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    user: Mapped["User"] = relationship(back_populates="transactions")

    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)

    primary_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("items.id"), nullable=False)
    primary_item: Mapped["Item"] = relationship(foreign_keys=[primary_item_id])

    counterparty_item_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("items.id"), nullable=True)
    counterparty_item: Mapped[Optional["Item"]] = relationship(foreign_keys=[counterparty_item_id])

    amount_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)  # в копейках

    direction: Mapped[str] = mapped_column(String(20), nullable=False)  # INCOME/EXPENSE/TRANSFER
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)  # ACTUAL/PLANNED

    category_l1: Mapped[str] = mapped_column(String(100), nullable=False)
    category_l2: Mapped[str] = mapped_column(String(100), nullable=False)
    category_l3: Mapped[str] = mapped_column(String(100), nullable=False)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("direction in ('INCOME','EXPENSE','TRANSFER')", name="ck_transactions_direction"),
        CheckConstraint("transaction_type in ('ACTUAL','PLANNED')", name="ck_transactions_type"),
        CheckConstraint("amount_rub >= 0", name="ck_transactions_amount_non_negative"),
    )