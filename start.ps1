$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path '.venv\Scripts\python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12+ is required.' }
}
& '.\.venv\Scripts\python.exe' -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependencies could not be installed.' }
if (-not (Test-Path node_modules)) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependencies could not be installed.' }
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
Write-Host 'Blocksmith is available at http://127.0.0.1:8000. Press Ctrl+C to stop.' -ForegroundColor Green
& '.\.venv\Scripts\python.exe' -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
