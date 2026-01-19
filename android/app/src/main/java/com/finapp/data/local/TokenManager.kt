package com.finapp.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.finapp.utils.Constants

class TokenManager(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val sharedPreferences: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        Constants.PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun saveToken(token: String) {
        android.util.Log.d("TokenManager", "Saving token: ${token.take(20)}...")
        val result = sharedPreferences.edit()
            .putString(Constants.KEY_ACCESS_TOKEN, token)
            .commit() // Используем commit() для синхронного сохранения
        android.util.Log.d("TokenManager", "Token saved: $result")
        // Проверяем, что токен действительно сохранен
        val savedToken = getToken()
        android.util.Log.d("TokenManager", "Token verification: ${savedToken != null}")
    }
    
    fun getToken(): String? {
        return sharedPreferences.getString(Constants.KEY_ACCESS_TOKEN, null)
    }
    
    fun deleteToken() {
        sharedPreferences.edit()
            .remove(Constants.KEY_ACCESS_TOKEN)
            .apply()
    }
    
    fun hasToken(): Boolean {
        return getToken() != null
    }
}
