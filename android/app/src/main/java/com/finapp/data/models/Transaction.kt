package com.finapp.data.models

import com.google.gson.annotations.SerializedName

enum class TransactionDirection {
    @SerializedName("INCOME")
    INCOME,
    
    @SerializedName("EXPENSE")
    EXPENSE,
    
    @SerializedName("TRANSFER")
    TRANSFER
}

enum class TransactionType {
    @SerializedName("ACTUAL")
    ACTUAL,
    
    @SerializedName("PLANNED")
    PLANNED
}

enum class TransactionStatus {
    @SerializedName("CONFIRMED")
    CONFIRMED,
    
    @SerializedName("UNCONFIRMED")
    UNCONFIRMED,
    
    @SerializedName("REALIZED")
    REALIZED
}

data class Transaction(
    val id: Int,
    @SerializedName("transaction_date") val transactionDate: String,
    @SerializedName("primary_item_id") val primaryItemId: Int,
    @SerializedName("counterparty_item_id") val counterpartyItemId: Int?,
    @SerializedName("counterparty_id") val counterpartyId: Int?,
    @SerializedName("amount_rub") val amountRub: Int,
    @SerializedName("amount_counterparty") val amountCounterparty: Int?,
    @SerializedName("primary_quantity_lots") val primaryQuantityLots: Int?,
    @SerializedName("counterparty_quantity_lots") val counterpartyQuantityLots: Int?,
    val direction: TransactionDirection,
    @SerializedName("transaction_type") val transactionType: TransactionType,
    val status: TransactionStatus,
    @SerializedName("category_id") val categoryId: Int?,
    val description: String?,
    val comment: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("chain_id") val chainId: Int?,
    @SerializedName("chain_name") val chainName: String?,
    @SerializedName("primary_card_item_id") val primaryCardItemId: Int?,
    @SerializedName("counterparty_card_item_id") val counterpartyCardItemId: Int?,
    @SerializedName("deleted_at") val deletedAt: String?,
    @SerializedName("linked_item_id") val linkedItemId: Int?,
    val source: String?
)

data class TransactionCreate(
    @SerializedName("transaction_date") val transactionDate: String,
    @SerializedName("primary_item_id") val primaryItemId: Int,
    @SerializedName("counterparty_item_id") val counterpartyItemId: Int? = null,
    @SerializedName("counterparty_id") val counterpartyId: Int? = null,
    @SerializedName("amount_rub") val amountRub: Int,
    @SerializedName("amount_counterparty") val amountCounterparty: Int? = null,
    @SerializedName("primary_quantity_lots") val primaryQuantityLots: Int? = null,
    @SerializedName("counterparty_quantity_lots") val counterpartyQuantityLots: Int? = null,
    val direction: TransactionDirection,
    @SerializedName("transaction_type") val transactionType: TransactionType,
    val status: TransactionStatus? = null,
    @SerializedName("category_id") val categoryId: Int? = null,
    val description: String? = null,
    val comment: String? = null
)
