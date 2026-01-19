package com.finapp.data.repository

import com.finapp.data.api.LimitsApi
import com.finapp.data.local.TokenManager
import com.finapp.data.models.Limit
import com.finapp.utils.ApiClient
import retrofit2.Response

class LimitsRepository(private val tokenManager: TokenManager) {
    private val limitsApi = ApiClient.createAuthenticatedApi<LimitsApi>(tokenManager)
    
    suspend fun fetchLimits(includeDeleted: Boolean = false): Result<List<Limit>> {
        return try {
            val response: Response<List<Limit>> = limitsApi.getLimits(includeDeleted)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to fetch limits"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
