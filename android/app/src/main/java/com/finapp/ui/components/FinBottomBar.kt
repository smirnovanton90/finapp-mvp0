package com.finapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.finapp.ui.theme.ModalBackground

enum class FinBottomTab {
    DASHBOARD,
    TRANSACTIONS,
    CATEGORIES,
    COUNTERPARTIES,
}

@Composable
fun FinBottomBar(
    selectedTab: FinBottomTab,
    onDashboardClick: () -> Unit,
    onTransactionsClick: () -> Unit,
    onAddClick: () -> Unit,
    onCategoriesClick: () -> Unit,
    onCounterpartiesClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val active = Color(0xFFDEDEDE)
    val inactive = Color(0xFF8D8D8D)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(72.dp)
                .clip(RoundedCornerShape(36.dp))
                .background(ModalBackground),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            IconButton(onClick = onDashboardClick) {
                Icon(
                    imageVector = Icons.Default.Dashboard,
                    contentDescription = "Дэшборд",
                    tint = if (selectedTab == FinBottomTab.DASHBOARD) active else inactive,
                )
            }

            IconButton(onClick = onTransactionsClick) {
                Icon(
                    imageVector = Icons.Default.CompareArrows,
                    contentDescription = "Транзакции",
                    tint = if (selectedTab == FinBottomTab.TRANSACTIONS) active else inactive,
                )
            }

            // Center button (stub by request)
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(Color(0xFF791038), Color(0xFFDF1E68)),
                        ),
                        alpha = 0.4f,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                IconButton(
                    onClick = onAddClick,
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Добавить",
                        tint = active,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            IconButton(onClick = onCategoriesClick) {
                Icon(
                    imageVector = Icons.Default.Folder,
                    contentDescription = "Категории",
                    tint = if (selectedTab == FinBottomTab.CATEGORIES) active else inactive,
                )
            }

            IconButton(onClick = onCounterpartiesClick) {
                Icon(
                    imageVector = Icons.Default.Groups,
                    contentDescription = "Контрагенты",
                    tint = if (selectedTab == FinBottomTab.COUNTERPARTIES) active else inactive,
                )
            }
        }
    }
}

