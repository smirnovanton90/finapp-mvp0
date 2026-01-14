package com.finapp.ui.transactions

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finapp.data.models.TransactionDirection
import com.finapp.data.models.TransactionType
import com.finapp.ui.components.LoadingIndicator
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionFormScreen(
    onNavigateBack: () -> Unit,
    viewModel: TransactionFormViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Новая транзакция") },
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
                val dateFormat = remember { SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()) }
                val dateString = remember(uiState.transactionDate) {
                    dateFormat.format(Date(uiState.transactionDate))
                }
                
                OutlinedTextField(
                    value = dateString,
                    onValueChange = { },
                    label = { Text("Дата") },
                    modifier = Modifier.fillMaxWidth(),
                    readOnly = true
                )
                
                OutlinedTextField(
                    value = uiState.amountRub.toString(),
                    onValueChange = {
                        viewModel.updateAmountRub(it.toDoubleOrNull() ?: 0.0)
                    },
                    label = { Text("Сумма") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                Text("Направление")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    TransactionDirection.values().forEach { direction ->
                        Row(
                            modifier = Modifier.weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            RadioButton(
                                selected = uiState.selectedDirection == direction,
                                onClick = { viewModel.updateDirection(direction) }
                            )
                            Text(
                                when (direction) {
                                    TransactionDirection.INCOME -> "Доход"
                                    TransactionDirection.EXPENSE -> "Расход"
                                    TransactionDirection.TRANSFER -> "Перевод"
                                },
                                modifier = Modifier.align(Alignment.CenterVertically)
                            )
                        }
                    }
                }
                
                Text("Тип")
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    TransactionType.values().forEach { type ->
                        Row(
                            modifier = Modifier.weight(1f),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            RadioButton(
                                selected = uiState.selectedTransactionType == type,
                                onClick = { viewModel.updateTransactionType(type) }
                            )
                            Text(
                                when (type) {
                                    TransactionType.ACTUAL -> "Фактическая"
                                    TransactionType.PLANNED -> "Плановая"
                                },
                                modifier = Modifier.align(Alignment.CenterVertically)
                            )
                        }
                    }
                }
                
                var expanded by remember { mutableStateOf(false) }
                val selectedItem = uiState.items.find { it.id == uiState.selectedPrimaryItemId }
                
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = !expanded }
                ) {
                    OutlinedTextField(
                        value = selectedItem?.name ?: "",
                        onValueChange = { },
                        label = { Text("Основной счет") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        uiState.items.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.name) },
                                onClick = {
                                    viewModel.updatePrimaryItemId(item.id)
                                    expanded = false
                                }
                            )
                        }
                    }
                }
                
                OutlinedTextField(
                    value = uiState.description,
                    onValueChange = { viewModel.updateDescription(it) },
                    label = { Text("Описание") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
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
