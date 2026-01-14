package com.finapp.data.models

import com.google.gson.annotations.SerializedName

data class Counterparty(
    val id: Int,
    val name: String?,
    @SerializedName("full_name") val fullName: String? = null,
    @SerializedName("entity_type") val entityType: String? = null,
    @SerializedName("first_name") val firstName: String? = null,
    @SerializedName("last_name") val lastName: String? = null,
    @SerializedName("middle_name") val middleName: String? = null
) {
    fun getDisplayName(): String {
        return when (entityType) {
            "PERSON" -> {
                val parts = listOfNotNull(lastName, firstName, middleName)
                if (parts.isNotEmpty()) parts.joinToString(" ") else (name ?: "")
            }
            else -> name ?: fullName ?: ""
        }
    }
}