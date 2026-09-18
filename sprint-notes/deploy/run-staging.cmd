@echo off
REM Sprint Notes staging launcher (no-admin path).
REM Keeps the Vite server alive on 127.0.0.1:5173; restarts it if it exits.
REM Launched by a per-user Task Scheduler task at logon (see README-STAGING.md).

cd /d "%~dp0.."
set STAGING=1

:loop
echo [%date% %time%] starting Sprint Notes (Vite)...
node "node_modules\vite\bin\vite.js"
echo [%date% %time%] Vite exited (code %errorlevel%); restarting in 5s...
timeout /t 5 /nobreak >nul
goto loop
