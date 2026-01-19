package com.finapp.data.repository

import com.finapp.data.api.UsersApi
import com.finapp.data.local.TokenManager
import com.finapp.data.models.User
import com.finapp.utils.ApiClient
import retrofit2.Response

class UsersRepository(private val tokenManager: TokenManager) {
    private val usersApi = ApiClient.createAuthenticatedApi<UsersApi>(tokenManager)
    
    suspend fun getMe(): Result<User> {
        return try {
            val response: Response<User> = usersApi.getMe()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to fetch user"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
