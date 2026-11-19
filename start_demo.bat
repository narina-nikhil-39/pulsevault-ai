@echo off
title SynapseHealth / PulseVault AI - Demo Launcher
echo ==========================================================
echo   SYNAPSEHEALTH / PULSEVAULT AI - CLINICAL DEMO RUNNER   
echo ==========================================================

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH.
    pause
    exit /b 1
)

REM Check Node
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH.
    pause
    exit /b 1
)

echo [INFO] Starting FastAPI Backend on http://localhost:8000 ...
start "SynapseHealth-Backend" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [INFO] Starting Vite Frontend on http://localhost:5173 ...
cd frontend
start "SynapseHealth-Frontend" cmd /k "npm run dev"
cd ..

echo [INFO] Warming up servers (wait 5s)...
timeout /t 5 /nobreak >nul

echo [SUCCESS] Opening default browser...
start http://localhost:5173

echo ==========================================================
echo Demo servers are running in separate terminal windows.
echo Close those windows when finished.
echo ==========================================================
pause
