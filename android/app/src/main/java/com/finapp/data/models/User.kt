package com.finapp.data.models

import com.google.gson.annotations.SerializedName

data class User(
    val id: Int,
    @SerializedName("accounting_start_date") val accountingStartDate: String?,
    val timezone: String = "Europe/Moscow",
    @SerializedName("timezone_auto") val timezoneAuto: Boolean = true,
    @SerializedName("timezone_detected") val timezoneDetected: String? = null,
)

data class UserProfileUpdate(
    val timezone: String? = null,
    @SerializedName("timezone_auto") val timezoneAuto: Boolean? = null,
    @SerializedName("timezone_detected") val timezoneDetected: String? = null,
)
