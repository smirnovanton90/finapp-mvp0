package com.finapp.ui.auth

import android.app.Activity
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.zIndex
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finapp.ui.theme.*
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onRegisterClick: () -> Unit = {},
    viewModel: LoginViewModel = viewModel()
) {
    val context = LocalContext.current
    val activity = context as? Activity
    
    var login by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var isPasswordFocused by remember { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsState()
    
    // Получаем Web Client ID
    val webClientId = remember {
        try {
            val id = context.resources.getIdentifier(
                "default_web_client_id",
                "string",
                context.packageName
            )
            if (id != 0) {
                context.getString(id)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }
    
    // Google Sign-In client
    val signInClient = remember(webClientId) {
        if (webClientId != null && webClientId.isNotEmpty() && webClientId != "YOUR_WEB_CLIENT_ID") {
            Log.d("LoginScreen", "Creating GoogleSignInOptions with Web Client ID: ${webClientId.take(30)}...")
            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(webClientId)
                .requestEmail()
                .build()
            GoogleSignIn.getClient(context, gso)
        } else {
            Log.w("LoginScreen", "Web Client ID is not configured properly")
            null
        }
    }
    
    // Google Sign-In launcher
    val googleSignInLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        Log.d("LoginScreen", "Google Sign-In result: ${result.resultCode}, data: ${result.data != null}")
        // Пытаемся получить результат независимо от resultCode
        // Google Sign-In может вернуть результат даже если resultCode не RESULT_OK
        val data = result.data
        if (data != null) {
            Log.d("LoginScreen", "Processing Google Sign-In result")
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            task.addOnSuccessListener { account ->
                val idToken = account.idToken
                Log.d("LoginScreen", "Got idToken: ${idToken != null}, account email: ${account.email}")
                if (idToken != null) {
                    Log.d("LoginScreen", "Calling viewModel.googleLogin")
                    viewModel.googleLogin(idToken)
                } else {
                    Log.e("LoginScreen", "idToken is null")
                }
            }.addOnFailureListener { exception ->
                when (exception) {
                    is ApiException -> {
                        val errorCode = exception.statusCode
                        val errorMessage = when (errorCode) {
                            10 -> {
                                val message = "DEVELOPER_ERROR: Неверные настройки OAuth в Google Cloud Console.\n\n" +
                                        "Для исправления:\n" +
                                        "1. Откройте https://console.cloud.google.com/\n" +
                                        "2. Перейдите в APIs & Services > Credentials\n" +
                                        "3. Создайте Android OAuth 2.0 Client ID:\n" +
                                        "   - Package name: com.finapp\n" +
                                        "   - SHA-1: получите через 'gradlew signingReport'\n" +
                                        "4. Убедитесь, что Web Client ID правильный\n" +
                                        "5. Перезапустите приложение"
                                Log.e("LoginScreen", "ApiException getting account: $errorCode", exception)
                                Log.e("LoginScreen", "Detailed error: $message")
                                message
                            }
                            12501 -> "SIGN_IN_CANCELLED: Пользователь отменил вход"
                            7 -> "NETWORK_ERROR: Проблема с сетью"
                            8 -> "INTERNAL_ERROR: Внутренняя ошибка Google"
                            else -> "Неизвестная ошибка: $errorCode"
                        }
                        // Показываем ошибку пользователю через ViewModel
                        viewModel.setError(errorMessage)
                    }
                    else -> {
                        Log.e("LoginScreen", "Exception getting account", exception)
                        viewModel.setError("Ошибка при входе через Google: ${exception.message}")
                    }
                }
            }
        } else {
            Log.w("LoginScreen", "Google Sign-In result data is null, resultCode: ${result.resultCode}")
        }
    }
    
    // Функция для запуска Google Sign-In
    fun startGoogleSignIn() {
        Log.d("LoginScreen", "startGoogleSignIn called")
        
        if (signInClient == null) {
            Log.e("LoginScreen", "GoogleSignInClient is null - Web Client ID not configured")
            return
        }
        
        Log.d("LoginScreen", "Launching Google Sign-In")
        val signInIntent = signInClient.signInIntent
        googleSignInLauncher.launch(signInIntent)
    }
    
    LaunchedEffect(uiState.isAuthenticated) {
        Log.d("LoginScreen", "LaunchedEffect triggered, isAuthenticated: ${uiState.isAuthenticated}")
        if (uiState.isAuthenticated) {
            Log.d("LoginScreen", "Calling onLoginSuccess")
            onLoginSuccess()
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        BackgroundOverlay1,
                        BackgroundOverlay2
                    )
                )
            )
            .background(BackgroundDark)
            .systemBarsPadding() // Учитываем системные панели
    ) {
        // Background decorative text - вертикально слева и справа
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 0.dp)
                .zIndex(0f) // Ниже модального окна
                .pointerInput(Unit) {
                    // Игнорируем все клики - пропускаем их дальше
                },
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // "БАЛАНС" text with gradient - вертикально слева
            Column(
                modifier = Modifier
                    .padding(start = 0.dp)
                    .pointerInput(Unit) { }, // Не перехватываем клики
                verticalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                GradientText(
                    text = "БА",
                    fontSize = 190.sp,
                    lineHeight = 167.sp,
                    gradient = Brush.horizontalGradient(
                        colors = listOf(
                            CyanGradient,
                            VioletPrimary,
                            VioletDark
                        )
                    )
                )
                GradientText(
                    text = "ЛА",
                    fontSize = 190.sp,
                    lineHeight = 167.sp,
                    gradient = Brush.horizontalGradient(
                        colors = listOf(
                            CyanGradient,
                            VioletPrimary,
                            VioletDark
                        )
                    )
                )
                GradientText(
                    text = "НС",
                    fontSize = 190.sp,
                    lineHeight = 167.sp,
                    gradient = Brush.horizontalGradient(
                        colors = listOf(
                            CyanGradient,
                            VioletPrimary,
                            VioletDark
                        )
                    )
                )
            }
            
            // "МАГА" text - вертикально справа
            Column(
                modifier = Modifier
                    .padding(end = 0.dp)
                    .pointerInput(Unit) { }, // Не перехватываем клики
                verticalArrangement = Arrangement.spacedBy(0.dp)
            ) {
                Text(
                    text = "МА",
                    style = TextStyle(
                        fontSize = 150.sp,
                        lineHeight = 151.sp,
                        fontWeight = FontWeight(500),
                        color = TextPrimary
                    )
                )
                Text(
                    text = "ГА",
                    style = TextStyle(
                        fontSize = 150.sp,
                        lineHeight = 151.sp,
                        fontWeight = FontWeight(500),
                        color = TextPrimary
                    )
                )
            }
        }
        
        // Modal window at bottom - должен быть поверх декоративного текста
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .zIndex(1f) // Поверх декоративного текста
                .background(
                    color = ModalBackground,
                    shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
                )
                .padding(start = 35.dp, end = 35.dp, top = 35.dp, bottom = 0.dp), // Убираем padding снизу
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(15.dp)
        ) {
            // Subtitle
            Text(
                text = "Для авторизации введите логин и пароль",
                style = TextStyle(
                    fontSize = 16.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight(400),
                    color = TextSecondary,
                    textAlign = TextAlign.Center
                ),
                modifier = Modifier.fillMaxWidth()
            )
            
            // Login field
            CustomTextField(
                value = login,
                onValueChange = { login = it },
                placeholder = "Логин",
                leadingIcon = Icons.Default.Person,
                modifier = Modifier.fillMaxWidth()
            )
            
            // Password field
            CustomTextField(
                value = password,
                onValueChange = { password = it },
                placeholder = "Пароль",
                leadingIcon = Icons.Default.Lock,
                isPassword = true,
                passwordVisible = passwordVisible,
                onPasswordVisibilityToggle = { passwordVisible = !passwordVisible },
                isFocused = isPasswordFocused,
                onFocusChange = { isPasswordFocused = it },
                modifier = Modifier.fillMaxWidth()
            )
            
            // Error message
            if (uiState.errorMessage != null) {
                Text(
                    text = uiState.errorMessage!!,
                    color = Color(0xFFFF6B6B), // Красный цвет для ошибок
                    style = TextStyle(fontSize = 12.sp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 35.dp, vertical = 8.dp),
                    lineHeight = 16.sp
                )
            }
            
            // Login and Register row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
            // Login button
            Box(
                modifier = Modifier
                    .width(117.dp)
                    .height(38.dp)
            ) {
                Button(
                    onClick = { viewModel.login(login, password) },
                    modifier = Modifier.fillMaxSize(),
                    enabled = !uiState.isLoading && login.isNotBlank() && password.isNotBlank(),
                    shape = RoundedCornerShape(37.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent
                    ),
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                brush = Brush.horizontalGradient(
                                    colors = listOf(
                                        VioletTertiary,
                                        VioletPrimary,
                                        VioletSecondary
                                    )
                                ),
                                shape = RoundedCornerShape(37.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                text = "Продолжить",
                                style = TextStyle(
                                    fontSize = 16.sp,
                                    lineHeight = 18.sp,
                                    fontWeight = FontWeight(400),
                                    color = Color.White
                                )
                            )
                        }
                    }
                }
            }
                
                // Register link
                TextButton(
                    onClick = onRegisterClick,
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Text(
                        text = "Регистрация",
                        style = TextStyle(
                            fontSize = 16.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight(500),
                            color = VioletPrimary,
                            textDecoration = TextDecoration.Underline
                        ),
                        textAlign = TextAlign.Right
                    )
                }
            }
            
            // Divider
            Divider(
                modifier = Modifier.fillMaxWidth(),
                color = TextSecondary,
                thickness = 1.dp
            )
            
            // Google login button
            Button(
                onClick = { 
                    Log.d("LoginScreen", "Google button clicked")
                    startGoogleSignIn() 
                },
                modifier = Modifier
                    .width(250.dp)
                    .height(43.dp)
                    .padding(bottom = 0.dp), // Убираем отступ снизу
                shape = RoundedCornerShape(37.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GoogleButtonBackground
                ),
                contentPadding = PaddingValues(10.dp)
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Google logo
                    val context = LocalContext.current
                    val googleLogoId = context.resources.getIdentifier("google_logo", "drawable", context.packageName)
                    
                    if (googleLogoId != 0) {
                        androidx.compose.foundation.Image(
                            painter = painterResource(id = googleLogoId),
                            contentDescription = "Google",
                            modifier = Modifier.size(23.dp)
                        )
                    } else {
                        // Fallback если логотип не найден
                        Box(
                            modifier = Modifier
                                .size(23.dp)
                                .background(
                                    color = Color.White,
                                    shape = androidx.compose.foundation.shape.CircleShape
                                )
                        )
                    }
                    
                    Text(
                        text = "Авторизоваться с Google",
                        style = TextStyle(
                            fontSize = 16.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight(400),
                            color = GoogleButtonText
                        )
                    )
                }
            }
        }
    }
}

@Composable
fun GradientText(
    text: String,
    fontSize: androidx.compose.ui.unit.TextUnit,
    lineHeight: androidx.compose.ui.unit.TextUnit,
    gradient: Brush,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        style = TextStyle(
            fontSize = fontSize,
            lineHeight = lineHeight,
            fontWeight = FontWeight(500),
            brush = gradient
        ),
        modifier = modifier
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    leadingIcon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onPasswordVisibilityToggle: (() -> Unit)? = null,
    isFocused: Boolean = false,
    onFocusChange: ((Boolean) -> Unit)? = null
) {
    var isFocusedState by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    
    // Анимация свечения при фокусе
    val glowAlpha by animateFloatAsState(
        targetValue = if (isFocusedState) 1f else 0f,
        animationSpec = tween(durationMillis = 300, easing = EaseOut),
        label = "glow"
    )
    
    
    Box(
        modifier = modifier
            .width(302.dp)
            .height(42.dp)
            .background(
                color = FieldBackground,
                shape = RoundedCornerShape(70.dp)
            )
            .border(
                width = 2.dp,
                color = VioletPrimary,
                shape = RoundedCornerShape(70.dp)
            )
            .then(
                if (isFocusedState && glowAlpha > 0.05f) {
                    Modifier.drawBehind {
                        // Параметры тени из дизайна: blur=42.6, spread=-16, position=0,0
                        val shadowBlur = 42.6f * glowAlpha
                        val shadowSpread = -16f * glowAlpha
                        val cornerRadius = 35f // 70px / 2 для border-radius 70px
                        
                        if (shadowBlur > 1f) {
                            // Рисуем тень с правильными параметрами
                            // Используем меньше слоев и меньшую прозрачность для менее яркой тени
                            val glowSteps = 6
                            for (i in 1..glowSteps) {
                                val stepProgress = i / glowSteps.toFloat()
                                // Уменьшаем альфа для менее яркой тени
                                val stepAlpha = glowAlpha * (1f - stepProgress) * 0.15f
                                val stepBlur = shadowBlur * stepProgress
                                val stepSpread = shadowSpread * stepProgress
                                val glowColor = VioletPrimary.copy(alpha = stepAlpha)
                                
                                drawRoundRect(
                                    color = glowColor,
                                    topLeft = Offset(-stepBlur + stepSpread, -stepBlur + stepSpread),
                                    size = androidx.compose.ui.geometry.Size(
                                        size.width + (stepBlur - stepSpread) * 2,
                                        size.height + (stepBlur - stepSpread) * 2
                                    ),
                                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(
                                        (cornerRadius + stepBlur - stepSpread).coerceAtLeast(0f)
                                    )
                                )
                            }
                        }
                    }
                } else {
                    Modifier
                }
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 22.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (isFocusedState) TextPrimary else TextSecondary
            )
            
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focusRequester)
                    .onFocusChanged { focusState ->
                        isFocusedState = focusState.isFocused
                        onFocusChange?.invoke(focusState.isFocused)
                    },
                textStyle = TextStyle(
                    fontSize = 16.sp,
                    lineHeight = 18.sp,
                    fontWeight = FontWeight(400),
                    color = if (isFocusedState) TextPrimary else TextSecondary
                ),
                cursorBrush = SolidColor(Color.White),
                visualTransformation = if (isPassword && !passwordVisible) {
                    PasswordVisualTransformation()
                } else {
                    VisualTransformation.None
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (isPassword) KeyboardType.Password else KeyboardType.Text
                ),
                singleLine = true,
                decorationBox = @Composable { innerTextField: @Composable () -> Unit ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(
                                indication = null,
                                interactionSource = remember { MutableInteractionSource() }
                            ) {
                                focusRequester.requestFocus()
                            }
                    ) {
                        if (value.isEmpty()) {
                            Text(
                                text = placeholder,
                                style = TextStyle(
                                    fontSize = 16.sp,
                                    lineHeight = 18.sp,
                                    fontWeight = FontWeight(400),
                                    color = if (isFocusedState) TextPrimary else TextSecondary
                                )
                            )
                        }
                        innerTextField()
                    }
                }
            )
            
            if (isPassword && onPasswordVisibilityToggle != null) {
                IconButton(
                    onClick = onPasswordVisibilityToggle,
                    modifier = Modifier.size(18.dp)
                ) {
                    Icon(
                        imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                        contentDescription = if (passwordVisible) "Скрыть пароль" else "Показать пароль",
                        modifier = Modifier.size(18.dp),
                        tint = if (isFocusedState) TextPrimary else TextSecondary
                    )
                }
            }
        }
    }
}
