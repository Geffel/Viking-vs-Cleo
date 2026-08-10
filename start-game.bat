@echo off
rem Startar Viking vs Cleo. Dubbelklicka bara pa filen.
rem OBS: filen maste sparas med CRLF-radbrytningar - cmd tappar tecken annars.
chcp 65001 >nul
setlocal
title Viking vs Cleo - server
cd /d "%~dp0"

set PORT=3000

echo.
echo   Startar Viking vs Cleo...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js hittades inte.
  echo   Installera från https://nodejs.org och kör den här filen igen.
  echo.
  pause
  exit /b 1
)

rem En gammal server som ligger kvar blockerar porten - stäng den först.
call :stoppa_gammal

if not exist "node_modules\" (
  echo   Första starten - hämtar beroenden. Det tar en stund.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install misslyckades. Kontrollera nätverket och försök igen.
    echo.
    pause
    exit /b 1
  )
  echo.
)

rem Öppnar webbläsaren när servern hunnit upp. ping används som fördröjning -
rem timeout slutar fungera så fort filen körs med omdirigerad indata.
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:%PORT%"

echo   Det här fönstret ÄR servern. Låt det stå öppet så länge ni spelar.
echo   Adressen de andra ska använda står precis nedanför.

node server/index.js

echo.
echo   Servern har stannat.
echo   Tryck på en tangent för att stänga fönstret.
pause >nul
exit /b 0

rem ---------------------------------------------------------------------------
:stoppa_gammal
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"TCP .*:%PORT% .*LISTENING"') do (
  taskkill /f /pid %%P >nul 2>&1
)
exit /b 0
