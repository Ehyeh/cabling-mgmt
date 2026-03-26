@echo off
setlocal
cd /d "%~dp0"
echo ══════════════════════════════════════════════════
echo   DCM — Cabling Management Local Server
echo ══════════════════════════════════════════════════
echo.

:: Check if python is available
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] No se encontro Python en este sistema.
    echo Asegurate de tener Python instalado y en el PATH.
    echo.
    pause
    exit /b
)

echo [+] Iniciando servidor local en el puerto 8000...
echo [+] La ventana se cerrara automaticamente al terminar.
echo.

:: Start server in background
start /b python -m http.server 8000 >nul 2>&1

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Open browser
echo [+] Abriendo aplicacion en el navegador...
start http://localhost:8000

echo.
echo [!] Servidor ejecutandose: NO CIERRES ESTA VENTANA si quieres seguir usando la app.
echo [!] Presiona Ctrl+C en esta ventana para detener el servidor.
echo.
pause
