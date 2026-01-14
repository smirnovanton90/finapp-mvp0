# Инструкции по настройке проекта в Android Studio

## Быстрая настройка

1. **Откройте проект в Android Studio:**
   - Запустите Android Studio
   - Выберите `File` → `Open`
   - Выберите папку `android` из этого репозитория
   - Нажмите `OK`

2. **Дождитесь синхронизации Gradle:**
   - Android Studio автоматически обнаружит проект Gradle
   - Начнется синхронизация зависимостей
   - Это может занять несколько минут при первом запуске

3. **Если появились ошибки:**
   - Убедитесь, что у вас установлен JDK 17 или выше (File → Project Structure → SDK Location)
   - Убедитесь, что Android SDK установлен (File → Settings → Appearance & Behavior → System Settings → Android SDK)
   - Если ошибки связаны с зависимостями, нажмите `Sync Project with Gradle Files` (иконка слоненка в тулбаре)

4. **Создание конфигурации запуска:**
   - После успешной синхронизации Gradle, модуль `app` будет доступен
   - Выберите `Run` → `Edit Configurations...`
   - Нажмите `+` → `Android App`
   - Название: `app`
   - Module: `app`
   - Launch: `Default Activity`
   - Нажмите `OK`

5. **Запуск приложения:**
   - Подключите Android устройство или запустите эмулятор
   - Нажмите `Run` (зеленая стрелка) или `Shift+F10`

## Возможные проблемы

### "no modules" ошибка
- Убедитесь, что вы открыли папку `android`, а не корневую папку проекта
- Проверьте, что файл `settings.gradle.kts` существует в корне папки `android`
- Попробуйте `File` → `Invalidate Caches...` → `Invalidate and Restart`

### Ошибки синхронизации Gradle
- Проверьте подключение к интернету (нужно скачать зависимости)
- Убедитесь, что версия Gradle совместима (используется Gradle 8.2)
- Попробуйте `File` → `Sync Project with Gradle Files`

### Ошибки компиляции
- Убедитесь, что все файлы на месте
- Проверьте, что версии зависимостей совместимы
- Очистите проект: `Build` → `Clean Project`, затем `Build` → `Rebuild Project`

## Структура проекта

```
android/
├── app/                    # Модуль приложения
│   ├── build.gradle.kts   # Зависимости модуля
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/finapp/
├── build.gradle.kts        # Настройки проекта
├── settings.gradle.kts     # Определение модулей
└── gradle.properties       # Свойства Gradle
```

## Дальнейшие шаги

После успешной настройки проекта:
1. Настройте базовый URL API в `Constants.kt` (10.0.2.2 для эмулятора)
2. Убедитесь, что backend запущен
3. Настройте ViewModelFactory (см. README.md)
4. Запустите приложение
