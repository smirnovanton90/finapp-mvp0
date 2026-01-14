package com.finapp.data.api

import com.finapp.data.models.Category
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface CategoriesApi {
    @GET("/categories")
    suspend fun getCategories(
        @Query("include_archived") includeArchived: Boolean = true
    ): Response<List<Category>>
}