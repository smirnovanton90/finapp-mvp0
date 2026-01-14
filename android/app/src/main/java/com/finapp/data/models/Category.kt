package com.finapp.data.models

import com.google.gson.annotations.SerializedName

data class Category(
    val id: Int,
    val name: String,
    @SerializedName("icon_name") val iconName: String? = null,
    @SerializedName("parent_id") val parentId: Int?,
    @SerializedName("children") val children: List<Category> = emptyList()
)