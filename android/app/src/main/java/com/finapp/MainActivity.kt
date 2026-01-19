package com.finapp

import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import com.finapp.ui.categories.CategoriesScreen
import com.finapp.ui.components.FinBottomBar
import com.finapp.ui.components.FinBottomTab
import com.finapp.ui.counterparties.CounterpartiesListScreen
import com.finapp.ui.dashboard.DashboardScreen
import com.finapp.ui.items.ItemFormScreen
import com.finapp.ui.items.ItemsListScreen
import com.finapp.ui.theme.FinAppTheme
import com.finapp.ui.transactions.TransactionFormScreen
import com.finapp.ui.transactions.TransactionsListScreen
import com.finapp.utils.Constants

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Скрываем системные overlay и навигационную панель
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        )
        window.setFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        )
        
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
    
    val onLogout: () -> Unit = {
        tokenManager.deleteToken()
        isAuthenticated = false
    }
    
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    
    if (isAuthenticated) {
        val tabRoutes = remember {
            setOf(
                Constants.ROUTE_DASHBOARD,
                Constants.ROUTE_TRANSACTIONS_LIST,
                Constants.ROUTE_CATEGORIES,
                Constants.ROUTE_COUNTERPARTIES,
            )
        }
        val showBottomBar = currentDestination?.route in tabRoutes

        val selectedTab = when {
            currentDestination?.hierarchy?.any { it.route == Constants.ROUTE_TRANSACTIONS_LIST } == true -> FinBottomTab.TRANSACTIONS
            currentDestination?.hierarchy?.any { it.route == Constants.ROUTE_CATEGORIES } == true -> FinBottomTab.CATEGORIES
            currentDestination?.hierarchy?.any { it.route == Constants.ROUTE_COUNTERPARTIES } == true -> FinBottomTab.COUNTERPARTIES
            else -> FinBottomTab.DASHBOARD
        }

        Scaffold(
            bottomBar = {
                if (showBottomBar) {
                    FinBottomBar(
                        selectedTab = selectedTab,
                        onDashboardClick = {
                            navController.navigate(Constants.ROUTE_DASHBOARD) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onTransactionsClick = {
                            navController.navigate(Constants.ROUTE_TRANSACTIONS_LIST) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onAddClick = {
                            // Заглушка без действия по ТЗ
                        },
                        onCategoriesClick = {
                            navController.navigate(Constants.ROUTE_CATEGORIES) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onCounterpartiesClick = {
                            navController.navigate(Constants.ROUTE_COUNTERPARTIES) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                    )
                }
            }
        ) { innerPadding ->
            // Note: apply scaffold padding so content isn't covered by the bottom bar.
            Box(modifier = Modifier.padding(innerPadding)) {
                NavHost(
                    navController = navController,
                    startDestination = Constants.ROUTE_DASHBOARD
                ) {
                composable(Constants.ROUTE_DASHBOARD) {
                    DashboardScreen(
                        viewModel = viewModel(factory = viewModelFactory),
                        onLogout = onLogout,
                    )
                }
                    
                    composable(Constants.ROUTE_ITEMS_LIST) {
                        ItemsListScreen(
                            onAddItemClick = {
                                navController.navigate(Constants.ROUTE_ITEM_FORM)
                            },
                            onLogout = onLogout,
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
                            onLogout = onLogout,
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
                    
                    composable(Constants.ROUTE_CATEGORIES) {
                        CategoriesScreen()
                    }
                    
                    composable(Constants.ROUTE_COUNTERPARTIES) {
                        CounterpartiesListScreen(
                            viewModel = viewModel(factory = viewModelFactory),
                        )
                    }
                }
            }
        }
    } else {
        LoginScreen(
            onLoginSuccess = {
                android.util.Log.d("MainActivity", "onLoginSuccess called, updating isAuthenticated")
                // Проверяем, что токен действительно сохранен
                val hasToken = tokenManager.hasToken()
                android.util.Log.d("MainActivity", "Token exists: $hasToken")
                isAuthenticated = hasToken
                android.util.Log.d("MainActivity", "isAuthenticated set to: $isAuthenticated")
            },
            viewModel = viewModel(factory = viewModelFactory)
        )
    }
}