package com.finapp.data.repository

import com.finapp.data.api.CounterpartiesApi
import com.finapp.data.local.TokenManager
import com.finapp.data.models.Counterparty
import com.finapp.utils.ApiClient
import retrofit2.Response

class CounterpartiesRepository(private val tokenManager: TokenManager) {
    private val counterpartiesApi = ApiClient.createAuthenticatedApi<CounterpartiesApi>(tokenManager)
    
    suspend fun fetchCounterparties(includeDeleted: Boolean = false): Result<List<Counterparty>> {
        return try {
            val response: Response<List<Counterparty>> = counterpartiesApi.getCounterparties(includeDeleted)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to fetch counterparties"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}