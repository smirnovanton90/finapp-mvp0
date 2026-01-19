package com.finapp.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finapp.ui.components.LoadingIndicator
import com.finapp.ui.theme.ModalBackground
import com.finapp.ui.theme.TextPrimary
import com.finapp.ui.theme.TextSecondary
import com.finapp.ui.utils.CategoryIconMapper
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = viewModel(),
    onLogout: () -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsState()
    val sidePadding = 20.dp

    Scaffold(
    ) { paddingValues ->
        when {
            uiState.isLoading -> {
                LoadingIndicator()
            }

            uiState.errorMessage != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = uiState.errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentPadding = PaddingValues(vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // Верхний блок: приветствие и активы
                    item {
                        WelcomeAndAssetsHeader(
                            userName = uiState.userName ?: "Пользователь",
                            netAssets = uiState.netAssets,
                            onAvatarClick = onLogout,
                        )
                    }

                    // Блок просроченных транзакций
                    item {
                        Box(modifier = Modifier.padding(horizontal = sidePadding)) {
                            OverdueTransactionsCard(
                                count = uiState.overdueTransactionsCount,
                                onViewClick = {
                                    // Заглушка
                                },
                            )
                        }
                    }

                    // Раздел лимитов
                    if (uiState.limits.isNotEmpty()) {
                        item {
                            Text(
                                text = "Лимиты",
                                style = MaterialTheme.typography.titleLarge,
                                color = TextPrimary,
                                modifier = Modifier.padding(horizontal = sidePadding, vertical = 8.dp),
                            )
                        }

                        items(uiState.limits) { limitWithProgress ->
                            Box(modifier = Modifier.padding(horizontal = sidePadding)) {
                                LimitCard(limitWithProgress = limitWithProgress)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WelcomeAndAssetsCard(
    userName: String,
    netAssets: Long,
) {
    val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    val formattedAmount = formatter.format(netAssets / 100.0)
    val amountBrush = Brush.horizontalGradient(
        colorStops = arrayOf(
            0f to Color(0xFF2491FF),
            0.451923f to Color(0xFF7C6CF1),
            1f to Color(0xFFB33F77),
        ),
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color(0xFF5544D1),
                        Color(0xFF6C5DD7),
                    ),
                ),
            )
            .padding(24.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Привет, $userName!",
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "Чистые активы",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.8f),
            )
            Text(
                text = "$formattedAmount ₽",
                style = MaterialTheme.typography.headlineLarge.merge(
                    TextStyle(
                        brush = amountBrush,
                        fontWeight = FontWeight.Bold,
                    ),
                ),
            )
        }
    }
}

@Composable
fun WelcomeAndAssetsHeader(
    userName: String,
    netAssets: Long,
    onAvatarClick: () -> Unit = {},
) {
    val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    val formattedAmount = formatter.format(netAssets / 100.0)

    // Градиент суммы (как ранее, из SVG с суммой)
    val amountBrush = Brush.horizontalGradient(
        colorStops = arrayOf(
            0f to Color(0xFF2491FF),
            0.451923f to Color(0xFF7C6CF1),
            1f to Color(0xFFB33F77),
        ),
    )

    // Подложка (как в SVG): сверху прозрачнее -> снизу #5544D1
    val headerBrush = Brush.verticalGradient(
        colorStops = arrayOf(
            0f to Color(0xFF6C5DD7).copy(alpha = 0f),
            0.25f to Color(0xFF6C5DD7).copy(alpha = 0f),
            1f to Color(0xFF5544D1),
        ),
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 45.dp, bottomEnd = 45.dp))
            .background(headerBrush)
            .padding(horizontal = 20.dp, vertical = 24.dp),
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Строка с эмодзи, приветствием и аватаром
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Эмодзи и приветствие (слева)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "👋",
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text(
                        text = "Привет, $userName!",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                    )
                }
                
                // Аватар пользователя (справа, заглушка)
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(
                            brush = Brush.linearGradient(
                                colors = listOf(
                                    Color(0xFF7C6CF1),
                                    Color(0xFF6C5DD7),
                                    Color(0xFF5544D1),
                                ),
                            ),
                        )
                        .clickable(onClick = onAvatarClick),
                    contentAlignment = Alignment.Center,
                ) {
                    // Заглушка для фото - можно заменить на реальное изображение
                    Text(
                        text = "👤",
                        style = MaterialTheme.typography.headlineMedium,
                    )
                }
            }
            
            Text(
                text = "Активы на сегодня",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.6f),
            )
            Text(
                text = "$formattedAmount ₽",
                style = MaterialTheme.typography.headlineLarge.merge(
                    TextStyle(
                        brush = amountBrush,
                        fontWeight = FontWeight.Bold,
                    ),
                ),
            )
        }
    }
}

@Composable
fun OverdueTransactionsCard(
    count: Int,
    onViewClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color(0xFFDF1E68),
                        Color(0xFF791038),
                    ),
                ),
                alpha = 0.4f,
            )
            .padding(24.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            // Левая часть: текст и кнопка
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Просрочено",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color(0xFFDEDEDE),
                    fontWeight = FontWeight.Bold,
                )
                GradientButton(
                    text = "Просмотреть",
                    onClick = onViewClick,
                )
            }
            
            // Правая часть: большое число
            Text(
                text = "$count",
                style = MaterialTheme.typography.displayLarge,
                color = Color(0xFFAE2B5B).copy(alpha = 0.75f),
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
fun GradientButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .height(40.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(
                brush = Brush.horizontalGradient(
                    colors = listOf(
                        Color(0xFF7C6CF1),
                        Color(0xFF6C5DD7),
                        Color(0xFF5544D1),
                    ),
                ),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = Color.White,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
fun LimitCard(
    limitWithProgress: LimitWithProgress,
) {
    val limit = limitWithProgress.limit
    val progress = limitWithProgress.progress
    val formatter = NumberFormat.getNumberInstance(Locale("ru", "RU"))
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    val currentFormatted = formatter.format(limitWithProgress.currentAmount / 100.0)
    val limitFormatted = formatter.format(limit.amountRub / 100.0)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = ModalBackground,
        ),
        shape = RoundedCornerShape(20.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Название и сумма
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = limit.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = "$currentFormatted / $limitFormatted ₽",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                )
            }

            // Категория с иконкой
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = CategoryIconMapper.getIcon(limitWithProgress.categoryIconName),
                    contentDescription = null,
                    tint = TextSecondary,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = limitWithProgress.categoryName,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                )
            }

            // Статус бар
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(13.dp)
                    .clip(RoundedCornerShape(6.5.dp))
                    .background(TextSecondary.copy(alpha = 0.31f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(progress)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(6.5.dp))
                        .background(
                            when {
                                progress >= 1.0f -> Color(0xFFFB4C4F)
                                progress >= 0.8f -> Color(0xFFFF9800)
                                else -> Color(0xFF00C462)
                            }
                        ),
                )
            }
        }
    }
}
