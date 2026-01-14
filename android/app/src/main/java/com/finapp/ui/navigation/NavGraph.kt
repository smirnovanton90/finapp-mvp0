package com.finapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.finapp.ui.items.ItemFormScreen
import com.finapp.ui.items.ItemsListScreen
import com.finapp.ui.transactions.TransactionFormScreen
import com.finapp.ui.transactions.TransactionsListScreen
import com.finapp.utils.Constants

@Composable
fun NavGraph(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = Constants.ROUTE_ITEMS_LIST
    ) {
        composable(Constants.ROUTE_ITEMS_LIST) {
            ItemsListScreen(
                onAddItemClick = {
                    navController.navigate(Constants.ROUTE_ITEM_FORM)
                }
            )
        }
        
        composable(Constants.ROUTE_ITEM_FORM) {
            ItemFormScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
        
        composable(Constants.ROUTE_TRANSACTIONS_LIST) {
            TransactionsListScreen(
                onAddTransactionClick = {
                    navController.navigate(Constants.ROUTE_TRANSACTION_FORM)
                }
            )
        }
        
        composable(Constants.ROUTE_TRANSACTION_FORM) {
            TransactionFormScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}
