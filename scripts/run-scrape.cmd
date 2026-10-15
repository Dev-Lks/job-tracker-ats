@echo off
REM Duplo-clique: atualiza data/auto-jobs.json (APIs + merge do bot-jobs.json, se existir)
cd /d "%~dp0\.."
where node >nul 2>nul || set "PATH=C:\Users\Notmele\AppData\Local\hermes\tools\node-26.7.0-win32-x64;%PATH%"
where node >nul 2>nul || (echo Node nao encontrado. & pause & exit /b 1)
node scripts\scrape.mjs
echo.
echo Pronto! Recarregue o dashboard (botao Recarregar automaticas).
pause
