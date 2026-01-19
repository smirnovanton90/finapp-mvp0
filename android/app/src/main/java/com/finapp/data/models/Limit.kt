package com.finapp.data.models

import com.google.gson.annotations.SerializedName

enum class LimitPeriod {
    @SerializedName("WEEKLY")
    WEEKLY,
    
    @SerializedName("MONTHLY")
    MONTHLY,
    
    @SerializedName("YEARLY")
    YEARLY,
    
    @SerializedName("CUSTOM")
    CUSTOM
}

data class Limit(
    val id: Int,
    val name: String,
    val period: LimitPeriod,
    @SerializedName("category_id") val categoryId: Int,
    @SerializedName("amount_rub") val amountRub: Int,
    @SerializedName("custom_start_date") val customStartDate: String?,
    @SerializedName("custom_end_date") val customEndDate: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("deleted_at") val deletedAt: String?
)
