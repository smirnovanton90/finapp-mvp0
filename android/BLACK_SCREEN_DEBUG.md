# Диагностика черного экрана

Если вы видите черный экран вместо интерфейса приложения, проверьте следующее:

## 1. Проверьте логи в Logcat

1. В Android Studio откройте вкладку **Logcat** (внизу экрана)
2. Запустите приложение
3. Ищите ошибки (красные строки), особенно:
   - `RuntimeException`
   - `IllegalStateException`
   - Ошибки связанные с ViewModel
   - Ошибки связанные с Compose

## 2. Возможные причины

### ViewModel не создается
ViewModels требуют репозитории через конструктор, но `viewModel()` по умолчанию не может их создать без ViewModelFactory. Это может привести к ошибке во время выполнения.

**Решение**: Нужно настроить ViewModelFactory (см. IMPLEMENTATION_NOTES.md)

### Ошибка инициализации
Проверьте логи на наличие ошибок при инициализации компонентов.

### Проблема с навигацией
Если NavGraph не может быть создан, экран может быть черным.

## 3. Временное решение для тестирования

Можно временно создать простой экран без ViewModels для проверки, что Compose работает:

```kotlin
@Composable
fun TestScreen() {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("Тест", style = MaterialTheme.typography.headlineLarge)
        }
    }
}
```

Замените `LoginScreen` на `TestScreen` в MainActivity для проверки.
