# Заметки по реализации Android приложения

## Важные моменты

### ViewModel Factory

ViewModels требуют репозитории через конструктор. В Compose нужно использовать ViewModelFactory для создания ViewModels с параметрами.

Пример создания фабрики:
```kotlin
@Composable
fun ItemsListScreen(
    viewModel: ItemsListViewModel = viewModel(
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val tokenManager = TokenManager(context)
                val itemsRepository = ItemsRepository(tokenManager)
                return ItemsListViewModel(itemsRepository) as T
            }
        }
    )
)
```

Или использовать Hilt для dependency injection (более продвинутый подход).

### MainActivity - структура навигации

MainActivity должна использовать BottomNavigation для переключения между ItemsListScreen и TransactionsListScreen.

### Dependency Injection

Для MVP можно:
1. Создать ViewModelFactory для каждого ViewModel
2. Использовать Application-level синглтоны
3. Использовать Hilt (требует дополнительной настройки)

### Date Picker

В ItemFormScreen и TransactionFormScreen нужно добавить DatePicker. Для этого можно использовать:
- Material DatePicker (требует Material 3)
- Или простое текстовое поле с выбором даты

### Настройка проекта

1. Скопировать build.gradle.kts.example в app/build.gradle.kts
2. Настроить зависимости
3. Скопировать AndroidManifest.xml.example в app/src/main/AndroidManifest.xml
4. Убедиться, что package name соответствует com.finapp
