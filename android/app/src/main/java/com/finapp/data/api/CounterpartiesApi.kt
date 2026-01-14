package com.finapp.data.api

import com.finapp.data.models.Counterparty
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface CounterpartiesApi {
    @GET("/counterparties")
    suspend fun getCounterparties(
        @Query("include_deleted") includeDeleted: Boolean = false
    ): Response<List<Counterparty>>
}