package com.finapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.finapp.data.local.TokenManager
import com.finapp.data.repository.AuthRepository
import com.finapp.ui.auth.LoginScreen
import com.finapp.ui.navigation.NavGraph
import com.finapp.ui.theme.FinAppTheme
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.finapp.ui.items.ItemsListScreen
import com.finapp.ui.transactions.TransactionsListScreen
import com.finapp.utils.Constants

class MainActivity : ComponentActivity() {
    private lateinit var tokenManager: TokenManager
    private lateinit var authRepository: AuthRepository
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        tokenManager = TokenManager(this)
        authRepository = AuthRepository(tokenManager)
        
        setContent {
            FinAppTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()
                    
                    if (tokenManager.hasToken()) {
                        NavGraph(navController = navController)
                    } else {
                        LoginScreen(
                            onLoginSuccess = {
                                // Navigation will be handled by recomposition
                            }
                        )
                    }
                }
            }
        }
    }
}
