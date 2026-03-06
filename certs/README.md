# Локальные HTTPS-сертификаты (mkcert)

Сертификаты в этой папке используются для запуска фронтенда и бэкенда по HTTPS на localhost.

## Установка mkcert (один раз)

**Windows — предпочтительно winget** (есть в Windows 10/11 по умолчанию):
```powershell
winget install -e --id FiloSottile.mkcert
```
После установки закройте и снова откройте терминал (или перезапустите PowerShell), чтобы команда `mkcert` стала доступна.

**Windows (Scoop):**
```powershell
scoop bucket add extras
scoop install mkcert
```

**Windows (Chocolatey)** — только если уже установлен:
```powershell
choco install mkcert
```

**Ручная установка (Windows):** скачайте `mkcert-v1.4.4-windows-amd64.exe` из [Releases](https://github.com/FiloSottile/mkcert/releases), переименуйте в `mkcert.exe` и положите в папку из `PATH` (или вызывайте по полному пути).

**macOS:** `brew install mkcert`  
**Linux:** см. https://github.com/FiloSottile/mkcert#installation

## Генерация сертификатов

Из **корня репозитория** выполните:

```powershell
mkcert -install
cd certs
mkcert localhost 127.0.0.1
```

В папке `certs/` появятся файлы:
- `localhost+1.pem` — сертификат
- `localhost+1-key.pem` — приватный ключ

Файлы `*.pem` добавлены в `.gitignore` и не попадают в репозиторий.

## Запуск с HTTPS

1. Убедитесь, что сертификаты сгенерированы (см. выше).
2. Задайте переменные окружения для HTTPS: скопируйте нужные строки из файла в корне репозитория `env.https.example` в `frontend/.env.local` и `backend/.env`.
3. Запустите бэкенд по HTTPS: из папки `backend` — `.\run_https.ps1` (или `python -m uvicorn main:app --reload --ssl-keyfile ../certs/localhost+1-key.pem --ssl-certfile ../certs/localhost+1.pem`).
4. Запустите фронтенд по HTTPS: из папки `frontend` — `npm run dev:https`.

Откройте в браузере: **https://localhost:3000**
