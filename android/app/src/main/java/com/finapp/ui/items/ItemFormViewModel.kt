package com.finapp.ui.items

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.ItemCreate
import com.finapp.data.models.ItemKind
import com.finapp.data.repository.ItemsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.*

data class ItemFormUiState(
    val name: String = "",
    val selectedKind: ItemKind = ItemKind.ASSET,
    val typeCode: String = "cash",
    val currencyCode: String = "RUB",
    val initialValueRub: Double = 0.0,
    val openDate: Long = System.currentTimeMillis(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class ItemFormViewModel(private val itemsRepository: ItemsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ItemFormUiState())
    val uiState: StateFlow<ItemFormUiState> = _uiState.asStateFlow()
    
    fun updateName(name: String) {
        _uiState.value = _uiState.value.copy(name = name)
    }
    
    fun updateKind(kind: ItemKind) {
        _uiState.value = _uiState.value.copy(selectedKind = kind)
    }
    
    fun updateTypeCode(typeCode: String) {
        _uiState.value = _uiState.value.copy(typeCode = typeCode)
    }
    
    fun updateCurrencyCode(currencyCode: String) {
        _uiState.value = _uiState.value.copy(currencyCode = currencyCode)
    }
    
    fun updateInitialValueRub(value: Double) {
        _uiState.value = _uiState.value.copy(initialValueRub = value)
    }
    
    fun updateOpenDate(date: Long) {
        _uiState.value = _uiState.value.copy(openDate = date)
    }
    
    fun submit(onSuccess: () -> Unit) {
        val state = _uiState.value
        
        if (state.name.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Название обязательно")
            return
        }
        
        if (state.initialValueRub < 0) {
            _uiState.value = state.copy(errorMessage = "Начальная стоимость не может быть отрицательной")
            return
        }
        
        viewModelScope.launch {
            _uiState.value = state.copy(isLoading = true, errorMessage = null)
            
            val openDateString = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                .format(Date(state.openDate))
            
            val itemCreate = ItemCreate(
                kind = state.selectedKind,
                typeCode = state.typeCode,
                name = state.name,
                currencyCode = state.currencyCode,
                openDate = openDateString,
                initialValueRub = (state.initialValueRub * 100).toInt()
            )
            
            itemsRepository.createItem(itemCreate)
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
