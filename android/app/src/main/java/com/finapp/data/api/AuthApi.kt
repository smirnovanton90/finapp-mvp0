package com.finapp.data.api

import com.finapp.data.models.AuthLogin
import com.finapp.data.models.AuthRegister
import com.finapp.data.models.AuthResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApi {
    @POST("/auth/login")
    suspend fun login(@Body login: AuthLogin): Response<AuthResponse>
    
    @POST("/auth/register")
    suspend fun register(@Body register: AuthRegister): Response<AuthResponse>
}
