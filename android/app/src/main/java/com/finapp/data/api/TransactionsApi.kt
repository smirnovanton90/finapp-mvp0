package com.finapp.data.api

import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionCreate
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface TransactionsApi {
    @GET("/transactions")
    suspend fun getTransactions(): Response<List<Transaction>>
    
    @POST("/transactions")
    suspend fun createTransaction(@Body transaction: TransactionCreate): Response<Transaction>
}
