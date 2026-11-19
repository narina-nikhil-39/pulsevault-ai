<#
.SYNOPSIS
    PulseVault AI / SynapseHealth - 1-Click Interactive Demo Launcher
.DESCRIPTION
    Boots both the FastAPI backend and React frontend concurrently,
    seeds demo cohorts if needed, and launches the browser to the Doctor Console.
#>

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SYNAPSEHEALTH / PULSEVAULT AI - CLINICAL DEMO RUNNER   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Python & Node
try {
    $pythonVersion = python --version 2>&1
    Write-Host "[OK] Detected Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Python is required but not found in PATH." -ForegroundColor Red
    exit 1
}

try {
    $nodeVersion = node --version 2>&1
    Write-Host "[OK] Detected Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is required but not found in PATH." -ForegroundColor Red
    exit 1
}

# 2. Check Database Initialization
$dbPath = "data\synapsehealth.db"
if (-not (Test-Path $dbPath)) {
    Write-Host "[INFO] Initializing and seeding demo database..." -ForegroundColor Yellow
    python -c "from src.db.database import init_db; init_db()"
}

# 3. Launch Backend in background process
Write-Host "[INFO] Starting FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Cyan
$backendProc = Start-Process python -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload" -PassThru -NoNewWindow

# 4. Launch Frontend
Write-Host "[INFO] Starting Vite Frontend on http://localhost:5173 ..." -ForegroundColor Cyan
Push-Location frontend
$frontendProc = Start-Process npm.cmd -ArgumentList "run dev" -PassThru -NoNewWindow
Pop-Location

# 5. Wait for servers to spin up
Write-Host "[INFO] Warming up services (5 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 6. Open Browser
Write-Host "[SUCCESS] SynapseHealth is live! Opening browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to terminate the demo session." -ForegroundColor DarkGray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

try {
    # Keep script open while processes run
    Wait-Process -Id $backendProc.Id, $frontendProc.Id
} finally {
    Write-Host "`n[INFO] Stopping demo servers..." -ForegroundColor Yellow
    Stop-Process -Id $backendProc.Id -ErrorAction SilentlyContinue
    Stop-Process -Id $frontendProc.Id -ErrorAction SilentlyContinue
}
