package com.finapp.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.Category
import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionCreate
import com.finapp.data.repository.CategoriesRepository
import com.finapp.data.repository.CounterpartiesRepository
import com.finapp.data.repository.ItemsRepository
import com.finapp.data.repository.TransactionsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TransactionsListUiState(
    val transactions: List<Transaction> = emptyList(),
    val items: Map<Int, String> = emptyMap(),
    val categories: Map<Int, String> = emptyMap(),
    val categoryIcons: Map<Int, String?> = emptyMap(),
    val counterparties: Map<Int, String> = emptyMap(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class TransactionsListViewModel(
    private val transactionsRepository: TransactionsRepository,
    private val itemsRepository: ItemsRepository,
    private val categoriesRepository: CategoriesRepository,
    private val counterpartiesRepository: CounterpartiesRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(TransactionsListUiState())
    val uiState: StateFlow<TransactionsListUiState> = _uiState.asStateFlow()
    
    init {
        fetchData()
    }
    
    private fun flattenCategories(categories: List<Category>): Pair<Map<Int, String>, Map<Int, String?>> {
        val namesMap = mutableMapOf<Int, String>()
        val iconsMap = mutableMapOf<Int, String?>()
        fun addCategory(category: Category) {
            namesMap[category.id] = category.name
            iconsMap[category.id] = category.iconName
            category.children.forEach { addCategory(it) }
        }
        categories.forEach { addCategory(it) }
        return Pair(namesMap, iconsMap)
    }
    
    private fun fetchData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            val itemsResult = itemsRepository.fetchItems()
            val categoriesResult = categoriesRepository.fetchCategories()
            val counterpartiesResult = counterpartiesRepository.fetchCounterparties()
            val transactionsResult = transactionsRepository.fetchTransactions()
            
            val itemsMap = itemsResult.getOrNull()?.associate { it.id to it.name } ?: emptyMap()
            val (categoriesMap, categoryIconsMap) = categoriesResult.getOrNull()?.let { flattenCategories(it) } ?: Pair(emptyMap(), emptyMap())
            val counterpartiesMap = counterpartiesResult.getOrNull()?.associate { it.id to it.getDisplayName() } ?: emptyMap()
            
            when {
                transactionsResult.isSuccess -> {
                    _uiState.value = _uiState.value.copy(
                        transactions = transactionsResult.getOrNull() ?: emptyList(),
                        items = itemsMap,
                        categories = categoriesMap,
                        categoryIcons = categoryIconsMap,
                        counterparties = counterpartiesMap,
                        isLoading = false
                    )
                }
                else -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = transactionsResult.exceptionOrNull()?.message ?: "Ошибка загрузки",
                        items = itemsMap,
                        categories = categoriesMap,
                        categoryIcons = categoryIconsMap,
                        counterparties = counterpartiesMap
                    )
                }
            }
        }
    }
    
    fun fetchTransactions() {
        fetchData()
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