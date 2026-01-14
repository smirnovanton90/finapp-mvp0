package com.finapp

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.finapp.data.local.TokenManager
import com.finapp.ui.auth.LoginScreen
import com.finapp.ui.items.ItemFormScreen
import com.finapp.ui.items.ItemsListScreen
import com.finapp.ui.theme.FinAppTheme
import com.finapp.ui.transactions.TransactionFormScreen
import com.finapp.ui.transactions.TransactionsListScreen
import com.finapp.utils.Constants

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            FinAppTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainContent()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainContent() {
    val context = LocalContext.current
    val tokenManager = remember { TokenManager(context) }
    val navController = rememberNavController()
    var isAuthenticated by remember { mutableStateOf(tokenManager.hasToken()) }
    val viewModelFactory = remember { ViewModelFactory(context) }
    
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    
    if (isAuthenticated) {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Wallet, contentDescription = null) },
                        label = { Text("Активы") },
                        selected = currentDestination?.hierarchy?.any { it.route == Constants.ROUTE_ITEMS_LIST } == true,
                        onClick = {
                            navController.navigate(Constants.ROUTE_ITEMS_LIST) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.CompareArrows, contentDescription = null) },
                        label = { Text("Транзакции") },
                        selected = currentDestination?.hierarchy?.any { it.route == Constants.ROUTE_TRANSACTIONS_LIST } == true,
                        onClick = {
                            navController.navigate(Constants.ROUTE_TRANSACTIONS_LIST) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        ) { _ ->
            NavHost(
                navController = navController,
                startDestination = Constants.ROUTE_ITEMS_LIST
            ) {
                composable(Constants.ROUTE_ITEMS_LIST) {
                    ItemsListScreen(
                        onAddItemClick = {
                            navController.navigate(Constants.ROUTE_ITEM_FORM)
                        },
                        viewModel = viewModel(factory = viewModelFactory)
                    )
                }
                
                composable(Constants.ROUTE_ITEM_FORM) {
                    ItemFormScreen(
                        onNavigateBack = {
                            navController.popBackStack()
                        },
                        viewModel = viewModel(factory = viewModelFactory)
                    )
                }
                
                composable(Constants.ROUTE_TRANSACTIONS_LIST) {
                    TransactionsListScreen(
                        onAddTransactionClick = {
                            navController.navigate(Constants.ROUTE_TRANSACTION_FORM)
                        },
                        viewModel = viewModel(factory = viewModelFactory)
                    )
                }
                
                composable(Constants.ROUTE_TRANSACTION_FORM) {
                    TransactionFormScreen(
                        onNavigateBack = {
                            navController.popBackStack()
                        },
                        viewModel = viewModel(factory = viewModelFactory)
                    )
                }
            }
        }
    } else {
        LoginScreen(
            onLoginSuccess = {
                isAuthenticated = true
            },
            viewModel = viewModel(factory = viewModelFactory)
        )
    }
}