package com.finapp.data.api

import com.finapp.data.models.Item
import com.finapp.data.models.ItemCreate
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface ItemsApi {
    @GET("/items")
    suspend fun getItems(
        @Query("include_archived") includeArchived: Boolean = false,
        @Query("include_closed") includeClosed: Boolean = false
    ): Response<List<Item>>
    
    @POST("/items")
    suspend fun createItem(@Body item: ItemCreate): Response<Item>
}
