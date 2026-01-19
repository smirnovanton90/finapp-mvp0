package com.finapp.data.api

import com.finapp.data.models.Limit
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface LimitsApi {
    @GET("/limits")
    suspend fun getLimits(
        @Query("include_deleted") includeDeleted: Boolean = false,
        @Query("deleted_only") deletedOnly: Boolean = false
    ): Response<List<Limit>>
}
