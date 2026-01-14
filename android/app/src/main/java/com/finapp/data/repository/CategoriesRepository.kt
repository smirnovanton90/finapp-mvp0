package com.finapp.data.repository

import com.finapp.data.api.CategoriesApi
import com.finapp.data.local.TokenManager
import com.finapp.data.models.Category
import com.finapp.utils.ApiClient
import retrofit2.Response

class CategoriesRepository(private val tokenManager: TokenManager) {
    private val categoriesApi = ApiClient.createAuthenticatedApi<CategoriesApi>(tokenManager)
    
    suspend fun fetchCategories(includeArchived: Boolean = true): Result<List<Category>> {
        return try {
            val response: Response<List<Category>> = categoriesApi.getCategories(includeArchived)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception(response.message() ?: "Failed to fetch categories"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}