@echo off
rem Stanger av Viking vs Cleo. Dubbelklicka bara pa filen.
rem OBS: filen maste sparas med CRLF-radbrytningar - cmd tappar tecken annars.
chcp 65001 >nul
setlocal
title Viking vs Cleo - stänger av
cd /d "%~dp0"

set PORT=3000
set STOPPADE=0

echo.
echo   Stänger av Viking vs Cleo...
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"TCP .*:%PORT% .*LISTENING"') do (
  call :stoppa %%P
)

if "%STOPPADE%"=="0" (
  echo   Ingen server körde på port %PORT%. Inget att stänga av.
) else (
  echo.
  echo   Klart. Spelet är avstängt.
)

echo.
rem Kort paus så att texten hinner läsas innan fönstret stänger sig.
ping -n 5 127.0.0.1 >nul
exit /b 0

rem ---------------------------------------------------------------------------
rem Stänger bara Node.js. Har något annat program tagit porten lämnas det ifred.
:stoppa
tasklist /fi "PID eq %1" /fo csv /nh | findstr /i "node.exe" >nul
if errorlevel 1 (
  echo   Hoppar över PID %1 - det är inte Node.js, så den lämnas ifred.
  exit /b 0
)
taskkill /f /pid %1 >nul 2>&1
if errorlevel 1 (
  echo   Kunde inte stänga PID %1. Prova att köra filen som administratör.
) else (
  echo   Stängde servern, PID %1.
  set STOPPADE=1
)
exit /b 0
