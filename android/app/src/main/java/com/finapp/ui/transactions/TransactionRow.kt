package com.finapp.ui.transactions

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finapp.data.models.Transaction
import com.finapp.data.models.TransactionDirection
import com.finapp.ui.theme.Blue
import com.finapp.ui.theme.Green
import com.finapp.ui.theme.Red
import com.finapp.utils.formatRubles
import com.finapp.utils.toDate
import com.finapp.utils.formatDateTime

@Composable
fun TransactionRow(transaction: Transaction) {
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
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = transaction.description ?: "Транзакция",
                    style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = transaction.transactionDate.toDate()?.formatDateTime() ?: transaction.transactionDate,
                    style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
            
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = transaction.amountRub.formatRubles(),
                    style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = color
                )
                Text(
                    text = directionText,
                    style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}
