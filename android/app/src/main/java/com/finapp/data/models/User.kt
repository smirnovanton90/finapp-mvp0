package com.finapp.data.models

import com.google.gson.annotations.SerializedName

data class User(
    val id: Int,
    @SerializedName("accounting_start_date") val accountingStartDate: String?
)
