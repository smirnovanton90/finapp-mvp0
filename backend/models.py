from sqlalchemy import (
    String,
    DateTime,
    BigInteger,
    CheckConstraint,
    func,
    ForeignKey,
    Date,
    Text,
    Integer,
    Float,
    Boolean,
    LargeBinary,
    Numeric,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db import Base
from datetime import datetime, date
from typing import Optional


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    login: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(256), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    accounting_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    items: Mapped[list["Item"]] = relationship(back_populates="user")

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")
    transaction_chains: Mapped[list["TransactionChain"]] = relationship(
        back_populates="user"
    )
    limits: Mapped[list["Limit"]] = relationship(back_populates="user")
    categories: Mapped[list["Category"]] = relationship(back_populates="owner")
    category_states: Mapped[list["UserCategoryState"]] = relationship(
        back_populates="user"
    )
    counterparties: Mapped[list["Counterparty"]] = relationship(back_populates="owner")
    onboarding_states: Mapped[list["OnboardingState"]] = relationship(
        back_populates="user"
    )


class OnboardingState(Base):
    __tablename__ = "onboarding_states"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), primary_key=True
    )
    device_type: Mapped[str] = mapped_column(String(10), primary_key=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="PENDING"
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="onboarding_states")

    __table_args__ = (
        CheckConstraint(
            "device_type in ('WEB','MOBILE')",
            name="ck_onboarding_states_device_type",
        ),
        CheckConstraint(
            "status in ('PENDING','POSTPONED','IN_PROGRESS','COMPLETED','SKIPPED')",
            name="ck_onboarding_states_status",
        ),
    )


class Currency(Base):
    __tablename__ = "currencies"

    iso_char_code: Mapped[str] = mapped_column(String(3), primary_key=True)
    iso_num_code: Mapped[str] = mapped_column(String(3), nullable=False)
    nominal: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    eng_name: Mapped[str] = mapped_column(String(200), nullable=False)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    items: Mapped[list["Item"]] = relationship(back_populates="currency")


class FxRate(Base):
    __tablename__ = "fx_rates"

    rate_date: Mapped[date] = mapped_column(Date, primary_key=True)
    char_code: Mapped[str] = mapped_column(String(3), primary_key=True)
    nominal: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    rate: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MarketInstrument(Base):
    __tablename__ = "market_instruments"

    secid: Mapped[str] = mapped_column(String(50), primary_key=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, server_default="MOEX")
    isin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    short_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    type_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    engine: Mapped[str | None] = mapped_column(String(50), nullable=True)
    market: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_board_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    lot_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    face_value_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_traded: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    items: Mapped[list["Item"]] = relationship(back_populates="instrument")

    __table_args__ = (
        UniqueConstraint("provider", "secid", name="ux_market_instruments_provider_secid"),
    )


class MarketPrice(Base):
    __tablename__ = "market_prices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    instrument_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("market_instruments.secid"), nullable=False
    )
    board_id: Mapped[str] = mapped_column(String(20), nullable=False)
    price_date: Mapped[date] = mapped_column(Date, nullable=False)
    price_time: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    price_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    price_percent_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    accint_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    yield_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    source: Mapped[str | None] = mapped_column(String(30), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    instrument: Mapped["MarketInstrument"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "instrument_id", "board_id", "price_date", name="ux_market_prices_instrument_board_date"
        ),
    )


class CounterpartyIndustry(Base):
    __tablename__ = "counterparty_industries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)

    counterparties: Mapped[list["Counterparty"]] = relationship(
        back_populates="industry"
    )


class Counterparty(Base):
    __tablename__ = "counterparties"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    legal_form: Mapped[str | None] = mapped_column(String(200), nullable=True)
    inn: Mapped[str | None] = mapped_column(String(12), nullable=True)
    ogrn: Mapped[str | None] = mapped_column(String(15), unique=True, nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    license_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_mime: Mapped[str | None] = mapped_column(String(50), nullable=True)
    logo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    owner_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True
    )
    industry_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("counterparty_industries.id"), nullable=True
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner: Mapped[Optional["User"]] = relationship(back_populates="counterparties")
    items: Mapped[list["Item"]] = relationship(back_populates="bank")
    industry: Mapped[Optional["CounterpartyIndustry"]] = relationship(
        back_populates="counterparties"
    )

    __table_args__ = (
        CheckConstraint(
            "entity_type in ('LEGAL','PERSON')",
            name="ck_counterparties_entity_type",
        ),
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categories.id"), nullable=True
    )
    scope: Mapped[str] = mapped_column(String(10), nullable=False)
    icon_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    owner_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    archived_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    parent: Mapped[Optional["Category"]] = relationship(
        "Category", remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list["Category"]] = relationship(back_populates="parent")
    owner: Mapped[Optional["User"]] = relationship(back_populates="categories")
    user_states: Mapped[list["UserCategoryState"]] = relationship(
        back_populates="category"
    )

    __table_args__ = (
        CheckConstraint("scope in ('INCOME','EXPENSE','BOTH')", name="ck_categories_scope"),
    )


class UserCategoryState(Base):
    __tablename__ = "user_category_state"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), primary_key=True
    )
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("categories.id"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    icon_override: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="category_states")
    category: Mapped["Category"] = relationship(back_populates="user_states")


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    user: Mapped[User] = relationship(back_populates="items")

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    type_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    currency_code: Mapped[str] = mapped_column(
        String(3), ForeignKey("currencies.iso_char_code"), nullable=False
    )
    currency: Mapped[Currency] = relationship(back_populates="items")

    bank_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("counterparties.id"), nullable=True
    )
    bank: Mapped[Optional["Counterparty"]] = relationship(back_populates="items")

    account_last7: Mapped[str | None] = mapped_column(String(7), nullable=True)
    contract_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    card_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    card_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    card_kind: Mapped[str | None] = mapped_column(String(10), nullable=True)
    credit_limit: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    deposit_term_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deposit_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interest_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    interest_payout_order: Mapped[str | None] = mapped_column(String(20), nullable=True)
    interest_capitalization: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    interest_payout_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    instrument_id: Mapped[str | None] = mapped_column(
        String(50), ForeignKey("market_instruments.secid"), nullable=True
    )
    instrument: Mapped[Optional["MarketInstrument"]] = relationship(back_populates="items")
    instrument_board_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    position_lots: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    lot_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    face_value_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    initial_value_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_value_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)

    start_date: Mapped[date] = mapped_column(
        Date, server_default=func.current_date(), nullable=False
    )
    open_date: Mapped[date] = mapped_column(Date, nullable=False)
    history_status: Mapped[str] = mapped_column(String(20), nullable=False)
    opening_counterparty_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    closed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    plan_settings: Mapped[Optional["ItemPlanSettings"]] = relationship(
        back_populates="item",
        uselist=False,
        cascade="all, delete-orphan",
        foreign_keys="ItemPlanSettings.item_id",
    )

    __table_args__ = (
        CheckConstraint("kind in ('ASSET','LIABILITY')", name="ck_items_kind"),
        CheckConstraint(
            "(initial_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT')",
            name="ck_items_initial_non_negative",
        ),
        CheckConstraint(
            "(current_value_rub >= 0) or (type_code = 'bank_card' and card_kind = 'CREDIT')",
            name="ck_items_current_non_negative",
        ),
        CheckConstraint(
            "card_kind is null or card_kind in ('DEBIT','CREDIT')",
            name="ck_items_card_kind",
        ),
        CheckConstraint(
            "credit_limit is null or credit_limit >= 0",
            name="ck_items_credit_limit_non_negative",
        ),
        CheckConstraint(
            "(card_kind != 'CREDIT') or (credit_limit is not null)",
            name="ck_items_credit_limit_required",
        ),
        CheckConstraint(
            "(card_kind = 'CREDIT') or (credit_limit is null)",
            name="ck_items_credit_limit_only_credit",
        ),
        CheckConstraint(
            "card_kind is null or type_code = 'bank_card'",
            name="ck_items_card_kind_only_bank_card",
        ),
        CheckConstraint(
            "history_status in ('NEW','HISTORICAL')",
            name="ck_items_history_status",
        ),
        CheckConstraint(
            "(position_lots is null) or (position_lots >= 0)",
            name="ck_items_position_lots_non_negative",
        ),
    )


class ItemPlanSettings(Base):
    __tablename__ = "item_plan_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=False, unique=True
    )
    item: Mapped["Item"] = relationship(back_populates="plan_settings", foreign_keys=[item_id])

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    first_payout_rule: Mapped[str | None] = mapped_column(String(20), nullable=True)
    plan_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    loan_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    repayment_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    repayment_weekly_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repayment_monthly_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repayment_monthly_rule: Mapped[str | None] = mapped_column(String(20), nullable=True)
    repayment_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repayment_account_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    repayment_account: Mapped[Optional["Item"]] = relationship(
        foreign_keys=[repayment_account_id]
    )
    repayment_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payment_amount_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payment_amount_rub: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "(first_payout_rule is null) or (first_payout_rule in ('OPEN_DATE','MONTH_END','SHIFT_ONE_MONTH'))",
            name="ck_item_plan_settings_first_payout_rule",
        ),
        CheckConstraint(
            "(repayment_frequency is null) or (repayment_frequency in ('DAILY','WEEKLY','MONTHLY','REGULAR'))",
            name="ck_item_plan_settings_repayment_frequency",
        ),
        CheckConstraint(
            "(repayment_weekly_day is null) or (repayment_weekly_day between 0 and 6)",
            name="ck_item_plan_settings_weekly_day_range",
        ),
        CheckConstraint(
            "(repayment_monthly_day is null) or (repayment_monthly_day between 1 and 31)",
            name="ck_item_plan_settings_monthly_day_range",
        ),
        CheckConstraint(
            "(repayment_monthly_rule is null) or (repayment_monthly_rule in ('FIRST_DAY','LAST_DAY'))",
            name="ck_item_plan_settings_monthly_rule",
        ),
        CheckConstraint(
            "(repayment_interval_days is null) or (repayment_interval_days >= 1)",
            name="ck_item_plan_settings_interval_days",
        ),
        CheckConstraint(
            "(repayment_type is null) or (repayment_type in ('ANNUITY','DIFFERENTIATED'))",
            name="ck_item_plan_settings_repayment_type",
        ),
        CheckConstraint(
            "(payment_amount_kind is null) or (payment_amount_kind in ('TOTAL','PRINCIPAL'))",
            name="ck_item_plan_settings_payment_amount_kind",
        ),
        CheckConstraint(
            "(payment_amount_rub is null) or (payment_amount_rub >= 0)",
            name="ck_item_plan_settings_payment_amount_non_negative",
        ),
    )
class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    user: Mapped["User"] = relationship(back_populates="transactions")

    chain_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("transaction_chains.id"), nullable=True
    )
    chain: Mapped[Optional["TransactionChain"]] = relationship(back_populates="transactions")

    transaction_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    linked_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    source: Mapped[str | None] = mapped_column(String(30), nullable=True)

    primary_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("items.id"), nullable=False)
    primary_item: Mapped["Item"] = relationship(foreign_keys=[primary_item_id])

    primary_card_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    primary_card_item: Mapped[Optional["Item"]] = relationship(
        foreign_keys=[primary_card_item_id]
    )

    counterparty_item_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("items.id"), nullable=True)
    counterparty_item: Mapped[Optional["Item"]] = relationship(foreign_keys=[counterparty_item_id])
    counterparty_card_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    counterparty_card_item: Mapped[Optional["Item"]] = relationship(
        foreign_keys=[counterparty_card_item_id]
    )
    counterparty_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("counterparties.id"), nullable=True
    )
    counterparty: Mapped[Optional["Counterparty"]] = relationship(
        foreign_keys=[counterparty_id]
    )

    amount_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)  # в копейках
    amount_counterparty: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    primary_quantity_lots: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    counterparty_quantity_lots: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    direction: Mapped[str] = mapped_column(String(20), nullable=False)  # INCOME/EXPENSE/TRANSFER
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)  # ACTUAL/PLANNED
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="CONFIRMED"
    )

    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categories.id"), nullable=True
    )
    category: Mapped[Optional["Category"]] = relationship()

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def chain_name(self) -> str | None:
        return self.chain.name if self.chain else None

    __table_args__ = (
        CheckConstraint("direction in ('INCOME','EXPENSE','TRANSFER')", name="ck_transactions_direction"),
        CheckConstraint("transaction_type in ('ACTUAL','PLANNED')", name="ck_transactions_type"),
        CheckConstraint("status in ('CONFIRMED','UNCONFIRMED','REALIZED')", name="ck_transactions_status"),
        CheckConstraint("amount_rub >= 0", name="ck_transactions_amount_non_negative"),
        CheckConstraint(
            "(source is null) or (source in ('AUTO_ITEM_OPENING','AUTO_ITEM_CLOSING','AUTO_ITEM_COMMISSION','MANUAL'))",
            name="ck_transactions_source",
        ),
    )


class TransactionChain(Base):
    __tablename__ = "transaction_chains"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    user: Mapped["User"] = relationship(back_populates="transaction_chains")

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    weekly_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_rule: Mapped[str | None] = mapped_column(String(20), nullable=True)
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    linked_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    linked_item: Mapped[Optional["Item"]] = relationship(foreign_keys=[linked_item_id])

    source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    purpose: Mapped[str | None] = mapped_column(String(20), nullable=True)

    primary_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("items.id"), nullable=False)
    primary_item: Mapped["Item"] = relationship(foreign_keys=[primary_item_id])

    primary_card_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    primary_card_item: Mapped[Optional["Item"]] = relationship(
        foreign_keys=[primary_card_item_id]
    )

    counterparty_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    counterparty_item: Mapped[Optional["Item"]] = relationship(
        foreign_keys=[counterparty_item_id]
    )
    counterparty_card_item_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("items.id"), nullable=True
    )
    counterparty_card_item: Mapped[Optional["Item"]] = relationship(
        foreign_keys=[counterparty_card_item_id]
    )
    counterparty_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("counterparties.id"), nullable=True
    )
    counterparty: Mapped[Optional["Counterparty"]] = relationship(
        foreign_keys=[counterparty_id]
    )

    amount_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amount_counterparty: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    amount_is_variable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    amount_min_rub: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    amount_max_rub: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    direction: Mapped[str] = mapped_column(String(20), nullable=False)

    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("categories.id"), nullable=True
    )
    category: Mapped[Optional["Category"]] = relationship()

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="chain")

    __table_args__ = (
        CheckConstraint(
            "frequency in ('DAILY','WEEKLY','MONTHLY','REGULAR')",
            name="ck_transaction_chains_frequency",
        ),
        CheckConstraint(
            "direction in ('INCOME','EXPENSE','TRANSFER')",
            name="ck_transaction_chains_direction",
        ),
        CheckConstraint("amount_rub >= 0", name="ck_transaction_chains_amount_non_negative"),
        CheckConstraint(
            "(source is null) or (source in ('AUTO_ITEM','MANUAL'))",
            name="ck_transaction_chains_source",
        ),
        CheckConstraint(
            "(purpose is null) or (purpose in ('INTEREST','PRINCIPAL'))",
            name="ck_transaction_chains_purpose",
        ),
        CheckConstraint(
            "(amount_min_rub is null) or (amount_min_rub >= 0)",
            name="ck_transaction_chains_amount_min_non_negative",
        ),
        CheckConstraint(
            "(amount_max_rub is null) or (amount_max_rub >= 0)",
            name="ck_transaction_chains_amount_max_non_negative",
        ),
        CheckConstraint(
            "(weekly_day is null) or (weekly_day between 0 and 6)",
            name="ck_transaction_chains_weekly_day_range",
        ),
        CheckConstraint(
            "(monthly_day is null) or (monthly_day between 1 and 31)",
            name="ck_transaction_chains_monthly_day_range",
        ),
        CheckConstraint(
            "(monthly_rule is null) or (monthly_rule in ('FIRST_DAY','LAST_DAY'))",
            name="ck_transaction_chains_monthly_rule",
        ),
        CheckConstraint(
            "(interval_days is null) or (interval_days >= 1)",
            name="ck_transaction_chains_interval_days",
        ),
    )


class Limit(Base):
    __tablename__ = "limits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    user: Mapped["User"] = relationship(back_populates="limits")

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    custom_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    custom_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("categories.id"), nullable=False
    )
    category: Mapped[Optional["Category"]] = relationship()

    amount_rub: Mapped[int] = mapped_column(BigInteger, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "period in ('WEEKLY','MONTHLY','YEARLY','CUSTOM')",
            name="ck_limits_period",
        ),
        CheckConstraint("amount_rub >= 0", name="ck_limits_amount_non_negative"),
        CheckConstraint(
            "(period = 'CUSTOM' and custom_start_date is not null and custom_end_date is not null) "
            "or (period <> 'CUSTOM' and custom_start_date is null and custom_end_date is null)",
            name="ck_limits_custom_dates",
        ),
        CheckConstraint(
            "(custom_start_date is null or custom_end_date is null) "
            "or (custom_start_date <= custom_end_date)",
            name="ck_limits_custom_date_order",
        ),
    )
