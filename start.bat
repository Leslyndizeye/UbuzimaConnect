@echo off
echo Starting Ubuzima Connect...
echo.

REM Start backend
start "Ubuzima Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate && uvicorn main:app --reload --port 8000"

timeout /t 5 /nobreak >nul

REM Start frontend (Vite uses npm run dev)
start "Ubuzima Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
pause