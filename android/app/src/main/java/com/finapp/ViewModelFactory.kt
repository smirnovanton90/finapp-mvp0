package com.finapp

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.finapp.data.local.TokenManager
import com.finapp.data.repository.AuthRepository
import com.finapp.data.repository.ItemsRepository
import com.finapp.data.repository.TransactionsRepository
import com.finapp.ui.auth.LoginViewModel
import com.finapp.ui.items.ItemFormViewModel
import com.finapp.ui.items.ItemsListViewModel
import com.finapp.ui.transactions.TransactionFormViewModel
import com.finapp.ui.transactions.TransactionsListViewModel

class ViewModelFactory(private val context: Context) : ViewModelProvider.Factory {
    private val tokenManager by lazy { TokenManager(context) }
    private val authRepository by lazy { AuthRepository(tokenManager) }
    private val itemsRepository by lazy { ItemsRepository(tokenManager) }
    private val transactionsRepository by lazy { TransactionsRepository(tokenManager) }
    
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(LoginViewModel::class.java) -> {
                LoginViewModel(authRepository) as T
            }
            modelClass.isAssignableFrom(ItemsListViewModel::class.java) -> {
                ItemsListViewModel(itemsRepository) as T
            }
            modelClass.isAssignableFrom(ItemFormViewModel::class.java) -> {
                ItemFormViewModel(itemsRepository) as T
            }
            modelClass.isAssignableFrom(TransactionsListViewModel::class.java) -> {
                TransactionsListViewModel(transactionsRepository) as T
            }
            modelClass.isAssignableFrom(TransactionFormViewModel::class.java) -> {
                TransactionFormViewModel(transactionsRepository, itemsRepository) as T
            }
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
