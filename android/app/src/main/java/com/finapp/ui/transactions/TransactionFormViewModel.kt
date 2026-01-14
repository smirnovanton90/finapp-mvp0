package com.finapp.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.Item
import com.finapp.data.models.TransactionCreate
import com.finapp.data.models.TransactionDirection
import com.finapp.data.models.TransactionType
import com.finapp.data.repository.ItemsRepository
import com.finapp.data.repository.TransactionsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

data class TransactionFormUiState(
    val transactionDate: Long = System.currentTimeMillis(),
    val amountRub: Double = 0.0,
    val selectedDirection: TransactionDirection = TransactionDirection.EXPENSE,
    val selectedTransactionType: TransactionType = TransactionType.ACTUAL,
    val selectedPrimaryItemId: Int? = null,
    val description: String = "",
    val items: List<Item> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class TransactionFormViewModel(
    private val transactionsRepository: TransactionsRepository,
    private val itemsRepository: ItemsRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(TransactionFormUiState())
    val uiState: StateFlow<TransactionFormUiState> = _uiState.asStateFlow()
    
    init {
        loadItems()
    }
    
    private fun loadItems() {
        viewModelScope.launch {
            itemsRepository.fetchItems()
                .onSuccess { items ->
                    _uiState.value = _uiState.value.copy(
                        items = items,
                        selectedPrimaryItemId = items.firstOrNull()?.id
                    )
                }
        }
    }
    
    fun updateTransactionDate(date: Long) {
        _uiState.value = _uiState.value.copy(transactionDate = date)
    }
    
    fun updateAmountRub(amount: Double) {
        _uiState.value = _uiState.value.copy(amountRub = amount)
    }
    
    fun updateDirection(direction: TransactionDirection) {
        _uiState.value = _uiState.value.copy(selectedDirection = direction)
    }
    
    fun updateTransactionType(type: TransactionType) {
        _uiState.value = _uiState.value.copy(selectedTransactionType = type)
    }
    
    fun updatePrimaryItemId(itemId: Int?) {
        _uiState.value = _uiState.value.copy(selectedPrimaryItemId = itemId)
    }
    
    fun updateDescription(description: String) {
        _uiState.value = _uiState.value.copy(description = description)
    }
    
    fun submit(onSuccess: () -> Unit) {
        val state = _uiState.value
        
        if (state.selectedPrimaryItemId == null) {
            _uiState.value = state.copy(errorMessage = "Выберите счет")
            return
        }
        
        if (state.amountRub <= 0) {
            _uiState.value = state.copy(errorMessage = "Сумма должна быть больше нуля")
            return
        }
        
        viewModelScope.launch {
            _uiState.value = state.copy(isLoading = true, errorMessage = null)
            
            val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            val transactionDateString = dateFormat.format(Date(state.transactionDate))
            
            val transactionCreate = TransactionCreate(
                transactionDate = transactionDateString,
                primaryItemId = state.selectedPrimaryItemId!!,
                direction = state.selectedDirection,
                transactionType = state.selectedTransactionType,
                amountRub = (state.amountRub * 100).toInt(),
                description = state.description.ifBlank { null }
            )
            
            transactionsRepository.createTransaction(transactionCreate)
                .onSuccess {
                    onSuccess()
                }
                .onFailure { exception ->
                    _uiState.value = state.copy(
                        isLoading = false,
                        errorMessage = exception.message ?: "Ошибка создания"
                    )
                }
        }
    }
}
