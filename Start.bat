@echo off
rem First start downloads a private Node.js runtime and project dependencies.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ServerManager.ps1"
