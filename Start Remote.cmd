@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\remote-control-windows.ps1" -Action Start
if errorlevel 1 (
  echo.
  echo Could not start Codex Remote. See the error above.
  pause
  exit /b 1
)
