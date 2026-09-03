@echo off
title Liga Comercial - Remocao
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n='Liga Comercial';" ^
  "Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) \"$n.lnk\") -ErrorAction SilentlyContinue;" ^
  "Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) \"$n.lnk\") -ErrorAction SilentlyContinue;" ^
  "Remove-Item (Join-Path $env:LOCALAPPDATA 'LigaComercial') -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host '  Atalho, inicializacao automatica e dados locais removidos.' -ForegroundColor Green"
pause
