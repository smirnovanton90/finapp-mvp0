package com.finapp.data.repository

import com.finapp.data.local.TokenManager
import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionCreate
import com.finapp.data.api.TransactionsApi
import com.finapp.utils.ApiClient
import retrofit2.Response

class TransactionsRepository(private val tokenManager: TokenManager) {
    private val transactionsApi = ApiClient.createAuthenticatedApi<TransactionsApi>(tokenManager)
    
    suspend fun fetchTransactions(): Result<List<Transaction>> {
        return try {
            val response: Response<List<Transaction>> = transactionsApi.getTransactions()
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to fetch transactions"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun createTransaction(transaction: TransactionCreate): Result<Transaction> {
        return try {
            val response = transactionsApi.createTransaction(transaction)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to create transaction"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
