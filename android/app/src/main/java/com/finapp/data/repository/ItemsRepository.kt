package com.finapp.data.repository

import com.finapp.data.local.TokenManager
import com.finapp.data.models.Item
import com.finapp.data.models.ItemCreate
import com.finapp.data.api.ItemsApi
import com.finapp.utils.ApiClient
import retrofit2.Response

class ItemsRepository(private val tokenManager: TokenManager) {
    private val itemsApi = ApiClient.createAuthenticatedApi<ItemsApi>(tokenManager)
    
    suspend fun fetchItems(includeArchived: Boolean = false, includeClosed: Boolean = false): Result<List<Item>> {
        return try {
            val response: Response<List<Item>> = itemsApi.getItems(includeArchived, includeClosed)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to fetch items"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun createItem(item: ItemCreate): Result<Item> {
        return try {
            val response = itemsApi.createItem(item)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to create item"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
