from sqlalchemy import String, DateTime, BigInteger, CheckConstraint, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db import Base


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