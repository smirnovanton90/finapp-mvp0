package com.finapp.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionCreate
import com.finapp.data.repository.TransactionsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TransactionsListUiState(
    val transactions: List<Transaction> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class TransactionsListViewModel(private val transactionsRepository: TransactionsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(TransactionsListUiState())
    val uiState: StateFlow<TransactionsListUiState> = _uiState.asStateFlow()
    
    init {
        fetchTransactions()
    }
    
    fun fetchTransactions() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            transactionsRepository.fetchTransactions()
                .onSuccess { transactions ->
                    _uiState.value = _uiState.value.copy(
                        transactions = transactions,
                        isLoading = false
                    )
                }
                .onFailure { exception ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = exception.message ?: "Ошибка загрузки"
                    )
                }
        }
    }
    
    fun createTransaction(transaction: TransactionCreate, onSuccess: () -> Unit) {
        viewModelScope.launch {
            transactionsRepository.createTransaction(transaction)
                .onSuccess {
                    fetchTransactions()
                    onSuccess()
                }
                .onFailure { exception ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = exception.message ?: "Ошибка создания"
                    )
                }
        }
    }
}
