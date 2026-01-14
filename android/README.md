# FinApp Android

Android приложение для управления финансами, интегрированное с FinApp backend API.

## Требования

- Android Studio (Hedgehog | 2023.1.1 или новее)
- JDK 17 или выше
- Android SDK (API 26+, Target API 34)
- Backend API должен быть запущен на `http://localhost:8000`

## Настройка проекта

1. Откройте Android Studio
2. Выберите "Open an Existing Project" или "Open"
3. Выберите папку `android` из этого репозитория
4. Дождитесь синхронизации Gradle (Android Studio автоматически скачает зависимости)
5. Если нужно создать недостающие ресурсы (строки, цвета, темы), Android Studio предложит это сделать

## Настройка сети

### Для эмулятора:
Базовый URL: `http://10.0.2.2:8000` (10.0.2.2 - специальный IP для localhost хоста)

### Для физического устройства:
Используйте IP адрес вашего компьютера в локальной сети (например, `http://192.168.1.X:8000`)

### AndroidManifest.xml:
Убедитесь, что добавлено разрешение:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Для HTTP (не HTTPS) в debug режиме, создайте `res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
```

И добавьте в AndroidManifest.xml в тег `<application>`:
```xml
android:networkSecurityConfig="@xml/network_security_config"
```

## Структура проекта

См. план разработки для подробной структуры.

## Настройка ViewModelFactory

ViewModels требуют репозитории через конструктор. Необходимо использовать ViewModelFactory для создания ViewModels. Пример ViewModelFactory уже создан в `ViewModelFactory.kt`.

Для использования ViewModelFactory в Compose, используйте:
```kotlin
viewModel(factory = ViewModelFactory(context))
```

Или интегрируйте через Application-level dependency injection (Hilt/Koin).

## Запуск

1. Убедитесь, что backend запущен на `http://localhost:8000`
2. Настройте базовый URL в `Constants.kt` в соответствии с вашей средой (10.0.2.2 для эмулятора)
3. Настройте ViewModelFactory для ViewModels (см. раздел выше)
4. Запустите приложение на эмуляторе или физическом устройстве

## Функциональность

- Авторизация (логин)
- Просмотр списка активов и обязательств
- Добавление нового актива/обязательства
- Просмотр списка транзакций
- Добавление новой транзакции
