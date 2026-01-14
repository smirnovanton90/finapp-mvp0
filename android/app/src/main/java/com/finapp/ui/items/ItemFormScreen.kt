package com.finapp.ui.items

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finapp.data.models.ItemKind
import com.finapp.ui.components.LoadingIndicator
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemFormScreen(
    onNavigateBack: () -> Unit,
    viewModel: ItemFormViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Новый актив/обязательство") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { viewModel.submit(onNavigateBack) },
                        enabled = !uiState.isLoading
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp))
                        } else {
                            Text("Сохранить")
                        }
                    }
                }
            )
        }
    ) { paddingValues ->
        if (uiState.isLoading) {
            LoadingIndicator()
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedTextField(
                    value = uiState.name,
                    onValueChange = { viewModel.updateName(it) },
                    label = { Text("Название") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        RadioButton(
                            selected = uiState.selectedKind == ItemKind.ASSET,
                            onClick = { viewModel.updateKind(ItemKind.ASSET) }
                        )
                        Text("Актив", modifier = Modifier.align(Alignment.CenterVertically))
                    }
                    Row(
                        modifier = Modifier.weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        RadioButton(
                            selected = uiState.selectedKind == ItemKind.LIABILITY,
                            onClick = { viewModel.updateKind(ItemKind.LIABILITY) }
                        )
                        Text("Обязательство", modifier = Modifier.align(Alignment.CenterVertically))
                    }
                }
                
                OutlinedTextField(
                    value = uiState.typeCode,
                    onValueChange = { viewModel.updateTypeCode(it) },
                    label = { Text("Тип") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                OutlinedTextField(
                    value = uiState.currencyCode,
                    onValueChange = { viewModel.updateCurrencyCode(it) },
                    label = { Text("Валюта") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                OutlinedTextField(
                    value = uiState.initialValueRub.toString(),
                    onValueChange = {
                        viewModel.updateInitialValueRub(it.toDoubleOrNull() ?: 0.0)
                    },
                    label = { Text("Начальная стоимость") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()) }
                val dateString = remember(uiState.openDate) {
                    dateFormat.format(Date(uiState.openDate))
                }
                
                OutlinedTextField(
                    value = dateString,
                    onValueChange = { },
                    label = { Text("Дата открытия") },
                    modifier = Modifier.fillMaxWidth(),
                    readOnly = true,
                    trailingIcon = {
                        IconButton(onClick = { /* TODO: Show date picker */ }) {
                            Text("Выбрать")
                        }
                    }
                )
                
                if (uiState.errorMessage != null) {
                    Text(
                        text = uiState.errorMessage!!,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}
