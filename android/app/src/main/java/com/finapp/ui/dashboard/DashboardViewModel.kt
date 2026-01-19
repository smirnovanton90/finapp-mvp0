package com.finapp.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finapp.data.models.Item
import com.finapp.data.models.ItemKind
import com.finapp.data.models.Limit
import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionDirection
import com.finapp.data.models.TransactionStatus
import com.finapp.data.models.TransactionType
import com.finapp.data.repository.ItemsRepository
import com.finapp.data.repository.LimitsRepository
import com.finapp.data.repository.TransactionsRepository
import com.finapp.data.repository.UsersRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

data class LimitWithProgress(
    val limit: Limit,
    val categoryName: String,
    val categoryIconName: String?,
    val currentAmount: Int,
    val progress: Float // 0.0 to 1.0
)

data class DashboardUiState(
    val isLoading: Boolean = false,
    val userName: String? = null,
    val netAssets: Long = 0L,
    val overdueTransactionsCount: Int = 0,
    val limits: List<LimitWithProgress> = emptyList(),
    val errorMessage: String? = null,
)

class DashboardViewModel(
    private val usersRepository: UsersRepository,
    private val itemsRepository: ItemsRepository,
    private val transactionsRepository: TransactionsRepository,
    private val limitsRepository: LimitsRepository,
    private val categoriesRepository: com.finapp.data.repository.CategoriesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState(isLoading = true))
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            try {
                // Загружаем все данные параллельно
                val userResult = usersRepository.getMe()
                val itemsResult = itemsRepository.fetchItems()
                val transactionsResult = transactionsRepository.fetchTransactions()
                val limitsResult = limitsRepository.fetchLimits()
                val categoriesResult = categoriesRepository.fetchCategories()

                // Обрабатываем результаты
                val user = userResult.getOrNull()
                val items = itemsResult.getOrNull() ?: emptyList()
                val transactions = transactionsResult.getOrNull() ?: emptyList()
                val limits = limitsResult.getOrNull() ?: emptyList()
                val categories = categoriesResult.getOrNull() ?: emptyList()

                // Вычисляем чистые активы
                val assets = items.filter { it.kind == ItemKind.ASSET }
                    .sumOf { it.currentValueRub.toLong() }
                val liabilities = items.filter { it.kind == ItemKind.LIABILITY }
                    .sumOf { it.currentValueRub.toLong() }
                val netAssets = assets - liabilities

                // Вычисляем просроченные транзакции
                val today = LocalDate.now()
                val overdueCount = transactions.count { transaction ->
                    val transactionDate = try {
                        LocalDate.parse(transaction.transactionDate.split("T")[0])
                    } catch (e: Exception) {
                        null
                    }
                    transactionDate != null &&
                    transactionDate.isBefore(today) &&
                    transaction.transactionType == TransactionType.PLANNED &&
                    transaction.status != TransactionStatus.CONFIRMED
                }

                // Создаем карты категорий для быстрого поиска
                val categoryMap = mutableMapOf<Int, String>()
                val categoryIconMap = mutableMapOf<Int, String?>()
                fun addCategory(category: com.finapp.data.models.Category) {
                    categoryMap[category.id] = category.name
                    categoryIconMap[category.id] = category.iconName
                    category.children.forEach { addCategory(it) }
                }
                categories.forEach { addCategory(it) }

                // Вычисляем прогресс по лимитам
                val limitsWithProgress = limits.map { limit ->
                    val categoryName = categoryMap[limit.categoryId] ?: "Неизвестная категория"
                    val categoryIconName = categoryIconMap[limit.categoryId]
                    
                    // Вычисляем текущую сумму расходов по категории за период
                    val currentAmount = calculateLimitCurrentAmount(limit, transactions, today)
                    val progress = (currentAmount.toFloat() / limit.amountRub.toFloat()).coerceIn(0f, 1f)
                    
                    LimitWithProgress(
                        limit = limit,
                        categoryName = categoryName,
                        categoryIconName = categoryIconName,
                        currentAmount = currentAmount,
                        progress = progress
                    )
                }

                _uiState.value = DashboardUiState(
                    isLoading = false,
                    userName = "Пользователь", // Можно расширить, если будет имя в User
                    netAssets = netAssets,
                    overdueTransactionsCount = overdueCount,
                    limits = limitsWithProgress,
                )
            } catch (e: Exception) {
                _uiState.value = DashboardUiState(
                    isLoading = false,
                    errorMessage = e.message ?: "Не удалось загрузить данные",
                )
            }
        }
    }

    private fun calculateLimitCurrentAmount(
        limit: Limit,
        transactions: List<Transaction>,
        today: LocalDate
    ): Int {
        // Определяем период для лимита
        val (startDate, endDate) = when (limit.period) {
            com.finapp.data.models.LimitPeriod.WEEKLY -> {
                val start = today.minusDays(today.dayOfWeek.value.toLong() - 1)
                Pair(start, start.plusDays(6))
            }
            com.finapp.data.models.LimitPeriod.MONTHLY -> {
                val start = today.withDayOfMonth(1)
                Pair(start, start.plusMonths(1).minusDays(1))
            }
            com.finapp.data.models.LimitPeriod.YEARLY -> {
                val start = today.withDayOfYear(1)
                Pair(start, start.plusYears(1).minusDays(1))
            }
            com.finapp.data.models.LimitPeriod.CUSTOM -> {
                val start = limit.customStartDate?.let { LocalDate.parse(it) } ?: today
                val end = limit.customEndDate?.let { LocalDate.parse(it) } ?: today
                Pair(start, end)
            }
        }

        // Суммируем расходы по категории за период
        return transactions
            .filter { transaction ->
                transaction.categoryId == limit.categoryId &&
                transaction.direction == TransactionDirection.EXPENSE &&
                transaction.transactionType == TransactionType.ACTUAL
            }
            .filter { transaction ->
                try {
                    val transactionDate = LocalDate.parse(transaction.transactionDate.split("T")[0])
                    !transactionDate.isBefore(startDate) && !transactionDate.isAfter(endDate)
                } catch (e: Exception) {
                    false
                }
            }
            .sumOf { it.amountRub }
    }
}
