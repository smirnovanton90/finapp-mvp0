package com.finapp.data.models

import com.google.gson.annotations.SerializedName

enum class ItemKind {
    @SerializedName("ASSET")
    ASSET,
    
    @SerializedName("LIABILITY")
    LIABILITY
}

enum class ItemHistoryStatus {
    @SerializedName("NEW")
    NEW,
    
    @SerializedName("HISTORICAL")
    HISTORICAL
}

data class Item(
    val id: Int,
    val kind: ItemKind,
    @SerializedName("type_code") val typeCode: String,
    val name: String,
    @SerializedName("currency_code") val currencyCode: String,
    @SerializedName("counterparty_id") val counterpartyId: Int?,
    @SerializedName("open_date") val openDate: String,
    @SerializedName("opening_counterparty_item_id") val openingCounterpartyItemId: Int?,
    @SerializedName("account_last7") val accountLast7: String?,
    @SerializedName("contract_number") val contractNumber: String?,
    @SerializedName("card_last4") val cardLast4: String?,
    @SerializedName("card_account_id") val cardAccountId: Int?,
    @SerializedName("card_kind") val cardKind: String?,
    @SerializedName("credit_limit") val creditLimit: Int?,
    @SerializedName("deposit_term_days") val depositTermDays: Int?,
    @SerializedName("deposit_end_date") val depositEndDate: String?,
    @SerializedName("interest_rate") val interestRate: Double?,
    @SerializedName("interest_payout_order") val interestPayoutOrder: String?,
    @SerializedName("interest_capitalization") val interestCapitalization: Boolean?,
    @SerializedName("interest_payout_account_id") val interestPayoutAccountId: Int?,
    @SerializedName("instrument_id") val instrumentId: String?,
    @SerializedName("instrument_board_id") val instrumentBoardId: String?,
    @SerializedName("position_lots") val positionLots: Int?,
    @SerializedName("lot_size") val lotSize: Int?,
    @SerializedName("face_value_cents") val faceValueCents: Int?,
    @SerializedName("initial_value_rub") val initialValueRub: Int,
    @SerializedName("current_value_rub") val currentValueRub: Int,
    @SerializedName("start_date") val startDate: String,
    @SerializedName("history_status") val historyStatus: ItemHistoryStatus,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("closed_at") val closedAt: String?,
    @SerializedName("archived_at") val archivedAt: String?
)

data class ItemCreate(
    val kind: ItemKind,
    @SerializedName("type_code") val typeCode: String,
    val name: String,
    @SerializedName("currency_code") val currencyCode: String,
    @SerializedName("counterparty_id") val counterpartyId: Int? = null,
    @SerializedName("open_date") val openDate: String,
    @SerializedName("opening_counterparty_item_id") val openingCounterpartyItemId: Int? = null,
    @SerializedName("account_last7") val accountLast7: String? = null,
    @SerializedName("contract_number") val contractNumber: String? = null,
    @SerializedName("card_last4") val cardLast4: String? = null,
    @SerializedName("card_account_id") val cardAccountId: Int? = null,
    @SerializedName("card_kind") val cardKind: String? = null,
    @SerializedName("credit_limit") val creditLimit: Int? = null,
    @SerializedName("deposit_term_days") val depositTermDays: Int? = null,
    @SerializedName("interest_rate") val interestRate: Double? = null,
    @SerializedName("interest_payout_order") val interestPayoutOrder: String? = null,
    @SerializedName("interest_capitalization") val interestCapitalization: Boolean? = null,
    @SerializedName("interest_payout_account_id") val interestPayoutAccountId: Int? = null,
    @SerializedName("instrument_id") val instrumentId: String? = null,
    @SerializedName("instrument_board_id") val instrumentBoardId: String? = null,
    @SerializedName("position_lots") val positionLots: Int? = null,
    @SerializedName("opening_price_cents") val openingPriceCents: Int? = null,
    @SerializedName("commission_enabled") val commissionEnabled: Boolean? = null,
    @SerializedName("commission_amount_rub") val commissionAmountRub: Int? = null,
    @SerializedName("commission_payment_item_id") val commissionPaymentItemId: Int? = null,
    @SerializedName("initial_value_rub") val initialValueRub: Int
)
