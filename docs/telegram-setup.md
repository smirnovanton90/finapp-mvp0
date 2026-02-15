# Настройка Telegram-бота

## Переменные окружения (backend/.env)

```env
# Токен бота от @BotFather (обязательно для работы бота)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# YouGile API (для отправки ошибок в тикеты)
YOUGILE_API_KEY=your_api_key
YOUGILE_BASE_URL=https://ru.yougile.com/api-v2
YOUGILE_COLUMN_ID=uuid-колонки-доски-ОШИБКИ
```

## Frontend (.env.local)

```env
# Username бота для отображения ссылки в кабинете (опционально)
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=FinAppBot
```

## YouGile: получение columnId

1. Войдите в YouGile, откройте проект с префиксом FIN.
2. Откройте доску «ОШИБКИ».
3. ID колонки можно получить через API или из URL при открытии колонки.

## Команды бота

- `/start [код]` — привязка аккаунта (код из личного кабинета)
- `/unlink` — отвязать аккаунт
- `/settings` — текущие настройки
- `/time HH:MM` — время уведомлений (например `/time 08:30`)
- `/notify on` / `/notify off` — вкл/выкл уведомления
- `/bug описание` — создать тикет об ошибке в YouGile
