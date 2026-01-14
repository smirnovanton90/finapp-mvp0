package com.finapp.data.models

import com.google.gson.annotations.SerializedName

data class AuthResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("token_type") val tokenType: String,
    val user: AuthUser
)

data class AuthUser(
    val id: Int,
    val login: String,
    val name: String?
)

data class AuthLogin(
    val login: String,
    val password: String
)

data class AuthRegister(
    val login: String,
    val password: String,
    val name: String? = null
)
