package com.finapp.data.api

import com.finapp.data.models.User
import com.finapp.data.models.UserProfileUpdate
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH

interface UsersApi {
    @GET("/users/me")
    suspend fun getMe(): Response<User>

    @PATCH("/users/me")
    suspend fun updateMe(@Body body: UserProfileUpdate): Response<User>
}
