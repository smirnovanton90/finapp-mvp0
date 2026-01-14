package com.finapp.ui.transactions

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionDirection
import com.finapp.ui.theme.Blue
import com.finapp.ui.theme.Green
import com.finapp.ui.theme.Red
import com.finapp.ui.utils.CategoryIconMapper
import com.finapp.utils.formatRubles
import com.finapp.utils.toDate
import com.finapp.utils.formatDateTime

@Composable
fun TransactionRow(
    transaction: Transaction,
    itemNames: Map<Int, String> = emptyMap(),
    categoryNames: Map<Int, String> = emptyMap(),
    categoryIcons: Map<Int, String?> = emptyMap(),
    counterpartyNames: Map<Int, String> = emptyMap()
) {
    val color = when (transaction.direction) {
        TransactionDirection.INCOME -> Green
        TransactionDirection.EXPENSE -> Red
        TransactionDirection.TRANSFER -> Blue
    }
    
    val directionText = when (transaction.direction) {
        TransactionDirection.INCOME -> "Доход"
        TransactionDirection.EXPENSE -> "Расход"
        TransactionDirection.TRANSFER -> "Перевод"
    }
    
    val itemName = itemNames[transaction.primaryItemId] ?: "#${transaction.primaryItemId}"
    val categoryName = transaction.categoryId?.let { categoryNames[it] } ?: transaction.categoryId?.let { "#$it" }
    val categoryIconName = transaction.categoryId?.let { categoryIcons[it] }
    val categoryIcon = CategoryIconMapper.getIcon(categoryIconName)
    val counterpartyName = transaction.counterpartyId?.let { counterpartyNames[it] } ?: transaction.counterpartyId?.let { "#$it" }
    
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Фоновая иконка категории
        if (transaction.categoryId != null) {
            Icon(
                imageVector = categoryIcon,
                contentDescription = null,
                modifier = Modifier
                    .size(96.dp)
                    .align(Alignment.Center),
                tint = Color.White.copy(alpha = 0.45f)
            )
        }
        
        Column(
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    if (transaction.description != null) {
                        Text(
                            text = transaction.description,
                            style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    
                    if (transaction.comment != null) {
                        Text(
                            text = transaction.comment,
                            style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    
                    Text(
                        text = transaction.transactionDate.toDate()?.formatDateTime() ?: transaction.transactionDate,
                        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    
                    if (categoryName != null) {
                        Text(
                            text = categoryName,
                            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    
                    Text(
                        text = itemName,
                        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                    
                    if (counterpartyName != null) {
                        Text(
                            text = counterpartyName,
                            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
                
                Column(
                    horizontalAlignment = Alignment.End,
                    modifier = Modifier.padding(start = 16.dp)
                ) {
                    Text(
                        text = transaction.amountRub.formatRubles(),
                        style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = color
                    )
                    Text(
                        text = directionText,
                        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp),
                        color = color
                    )
                }
            }
            
            Divider(
                modifier = Modifier.padding(top = 12.dp),
                thickness = 1.dp
            )
        }
    }
}