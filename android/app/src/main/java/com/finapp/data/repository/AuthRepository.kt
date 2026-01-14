package com.finapp.data.repository

import com.finapp.data.api.ApiService
import com.finapp.data.local.TokenManager
import com.finapp.data.models.AuthLogin
import com.finapp.data.models.AuthRegister
import com.finapp.data.models.AuthResponse

class AuthRepository(private val tokenManager: TokenManager) {
    suspend fun login(login: String, password: String): Result<AuthResponse> {
        return try {
            val response = ApiService.authApi.login(AuthLogin(login, password))
            if (response.isSuccessful && response.body() != null) {
                val authResponse = response.body()!!
                tokenManager.saveToken(authResponse.accessToken)
                Result.success(authResponse)
            } else {
                Result.failure(Exception(response.message() ?: "Login failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun register(login: String, password: String, name: String?): Result<AuthResponse> {
        return try {
            val response = ApiService.authApi.register(AuthRegister(login, password, name))
            if (response.isSuccessful && response.body() != null) {
                val authResponse = response.body()!!
                tokenManager.saveToken(authResponse.accessToken)
                Result.success(authResponse)
            } else {
                Result.failure(Exception(response.message() ?: "Registration failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    fun logout() {
        tokenManager.deleteToken()
    }
    
    fun isAuthenticated(): Boolean {
        return tokenManager.hasToken()
    }
}
