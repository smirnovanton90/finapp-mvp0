# Запуск FastAPI по HTTPS на localhost (сертификаты из ../certs/)
# Выполнять из папки backend с активированным .venv

$certDir = Join-Path (Split-Path $PSScriptRoot -Parent) "certs"
$keyFile = Join-Path $certDir "localhost+1-key.pem"
$certFile = Join-Path $certDir "localhost+1.pem"

if (-not (Test-Path $keyFile) -or -not (Test-Path $certFile)) {
    Write-Host "Сертификаты не найдены. Сгенерируйте их:" -ForegroundColor Yellow
    Write-Host "  Из корня репо: cd certs; mkcert -install; mkcert localhost 127.0.0.1" -ForegroundColor Gray
    Write-Host "  Подробнее: certs/README.md" -ForegroundColor Gray
    exit 1
}

Set-Location $PSScriptRoot
& python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile $keyFile --ssl-certfile $certFile
