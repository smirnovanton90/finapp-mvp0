package com.finapp.data.api

import com.finapp.data.models.User
import retrofit2.Response
import retrofit2.http.GET

interface UsersApi {
    @GET("/users/me")
    suspend fun getMe(): Response<User>
}
