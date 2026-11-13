@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================================
echo   MDT-HUD · SUBIENDO CODIGO Y RELEASE v1.0.0 A GITHUB
echo   Repositorio: https://github.com/mediterraneanmotorsport/MDT-HUD.git
echo ============================================================================
echo.
echo Si se abre una ventana de inicio de sesion de GitHub, autorizala en tu navegador.
echo.
git branch -M main
git tag -f v1.0.0
git remote set-url origin https://github.com/mediterraneanmotorsport/MDT-HUD.git
git push -u origin main --force
git push origin v1.0.0 --force
echo.
echo ============================================================================
echo   PROCESO COMPLETADO. Revisa tu pagina de GitHub!
echo ============================================================================
pause
