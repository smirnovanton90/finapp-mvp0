package com.finapp.ui.items

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finapp.ui.components.LoadingIndicator

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemsListScreen(
    onAddItemClick: () -> Unit,
    viewModel: ItemsListViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Активы и обязательства") }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddItemClick) {
                Icon(Icons.Default.Add, contentDescription = "Добавить")
            }
        }
    ) { paddingValues ->
        when {
            uiState.isLoading && uiState.items.isEmpty() -> {
                LoadingIndicator()
            }
            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    val assets = uiState.items.filter { it.kind == com.finapp.data.models.ItemKind.ASSET }
                    val liabilities = uiState.items.filter { it.kind == com.finapp.data.models.ItemKind.LIABILITY }
                    
                    if (assets.isNotEmpty()) {
                        item {
                            Text(
                                text = "Активы",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }
                        items(assets) { item ->
                            ItemRow(item = item)
                        }
                    }
                    
                    if (liabilities.isNotEmpty()) {
                        item {
                            Text(
                                text = "Обязательства",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }
                        items(liabilities) { item ->
                            ItemRow(item = item)
                        }
                    }
                }
            }
        }
        
    }
}
