@echo off
chcp 65001 >nul
echo ============================================================================
echo   MDT-HUD - ABRIR PUERTO 1420 EN FIREWALL DE WINDOWS PARA DDU MOVIL (Wi-Fi)
echo ============================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de Administrador para abrir el puerto 1420...
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall delete rule name="MDT-HUD Mobile DDU (TCP 1420)" >nul 2>&1
netsh advfirewall firewall add rule name="MDT-HUD Mobile DDU (TCP 1420)" dir=in action=allow protocol=TCP localport=1420 profile=any
echo.
echo [OK] Puerto 1420 abierto en el Firewall de Windows (Redes Privadas y Publicas).
echo Ahora abre en el navegador de tu movil: http://192.168.1.112:1420
echo.
pause
