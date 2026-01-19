package com.finapp.ui.counterparties

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.Counterparty
import com.finapp.data.repository.CounterpartiesRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CounterpartiesListUiState(
    val isLoading: Boolean = false,
    val counterparties: List<Counterparty> = emptyList(),
    val errorMessage: String? = null,
)

class CounterpartiesListViewModel(
    private val counterpartiesRepository: CounterpartiesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CounterpartiesListUiState(isLoading = true))
    val uiState: StateFlow<CounterpartiesListUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val result = counterpartiesRepository.fetchCounterparties()
            _uiState.value = result.fold(
                onSuccess = { list ->
                    CounterpartiesListUiState(
                        isLoading = false,
                        counterparties = list.sortedBy { it.getDisplayName().lowercase() },
                    )
                },
                onFailure = { e ->
                    CounterpartiesListUiState(
                        isLoading = false,
                        counterparties = emptyList(),
                        errorMessage = e.message ?: "Не удалось загрузить контрагентов",
                    )
                },
            )
        }
    }
}

