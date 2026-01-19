package com.finapp.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LoginUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isAuthenticated: Boolean = false
)

class LoginViewModel(private val authRepository: AuthRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()
    
    init {
        _uiState.value = _uiState.value.copy(isAuthenticated = authRepository.isAuthenticated())
    }
    
    fun login(login: String, password: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            authRepository.login(login, password)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isAuthenticated = true
                    )
                }
                .onFailure { exception ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = exception.message ?: "Ошибка входа"
                    )
                }
        }
    }
    
    fun googleLogin(idToken: String) {
        viewModelScope.launch {
            android.util.Log.d("LoginViewModel", "googleLogin called with idToken: ${idToken.take(20)}...")
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            try {
                // Сохраняем токен
                authRepository.saveGoogleToken(idToken)
                android.util.Log.d("LoginViewModel", "Token saved, updating state to authenticated")
                
                // Небольшая задержка для гарантии сохранения
                kotlinx.coroutines.delay(100)
                
                // Проверяем, что токен действительно сохранен
                val isAuth = authRepository.isAuthenticated()
                android.util.Log.d("LoginViewModel", "Token verification: $isAuth")
                
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isAuthenticated = isAuth
                )
                android.util.Log.d("LoginViewModel", "State updated, isAuthenticated: ${_uiState.value.isAuthenticated}")
            } catch (e: Exception) {
                android.util.Log.e("LoginViewModel", "Error in googleLogin", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Ошибка авторизации через Google"
                )
            }
        }
    }
    
    fun setError(message: String) {
        _uiState.value = _uiState.value.copy(
            isLoading = false,
            errorMessage = message
        )
    }
}
