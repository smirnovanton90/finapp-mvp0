package com.finapp.ui.items

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.Item
import com.finapp.data.models.ItemCreate
import com.finapp.data.repository.ItemsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ItemsListUiState(
    val items: List<Item> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class ItemsListViewModel(private val itemsRepository: ItemsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ItemsListUiState())
    val uiState: StateFlow<ItemsListUiState> = _uiState.asStateFlow()
    
    init {
        fetchItems()
    }
    
    fun fetchItems() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            itemsRepository.fetchItems()
                .onSuccess { items ->
                    _uiState.value = _uiState.value.copy(
                        items = items,
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
    
    fun createItem(item: ItemCreate, onSuccess: () -> Unit) {
        viewModelScope.launch {
            itemsRepository.createItem(item)
                .onSuccess {
                    fetchItems()
                    onSuccess()
                }
                .onFailure { exception ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = exception.message ?: "Ошибка создания"
                    )
                }
        }
    }
    
    val assets: List<Item>
        get() = _uiState.value.items.filter { it.kind == com.finapp.data.models.ItemKind.ASSET }
    
    val liabilities: List<Item>
        get() = _uiState.value.items.filter { it.kind == com.finapp.data.models.ItemKind.LIABILITY }
}
