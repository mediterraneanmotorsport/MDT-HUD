@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================================
echo   MDT-HUD · SUBIENDO CODIGO Y RELEASE v1.0.6 A GITHUB
echo   Repositorio: https://github.com/mediterraneanmotorsport/MDT-HUD.git
echo ============================================================================
echo.
echo Si se abre una ventana de inicio de sesion de GitHub, autorizala en tu navegador.
echo.
git add .
git commit -m "Release v1.0.6 - Discord Webhook oficial Ingeniera MDT, SSE Mobile DDU, Focus Driver Broadcast"
git branch -M main
git tag -f v1.0.6
git remote set-url origin https://github.com/mediterraneanmotorsport/MDT-HUD.git
git push -u origin main
git push origin v1.0.6 --force
echo.
echo ============================================================================
echo   PROCESO COMPLETADO. Revisa tu pagina de GitHub y la pestana Actions!
echo ============================================================================
pause
