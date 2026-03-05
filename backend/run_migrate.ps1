# Запуск миграций через .venv (backend\.venv или корень проекта)
# Использование: .\run_migrate.ps1 upgrade head   или   .\run_migrate.ps1 current
$backendDir = $PSScriptRoot
$venvInBackend = Join-Path $backendDir ".venv\Scripts\python.exe"
$venvInRoot = Join-Path (Split-Path -Parent $backendDir) ".venv\Scripts\python.exe"
$venvPython = if (Test-Path $venvInBackend) { $venvInBackend } else { $venvInRoot }
if (-not (Test-Path $venvPython)) {
    Write-Error ".venv не найден (ожидался backend\.venv или корень проекта\.venv)"
    exit 1
}
Push-Location $PSScriptRoot
try {
    & $venvPython -m alembic @args
} finally {
    Pop-Location
}
