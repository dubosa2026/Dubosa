@echo off
REM ============================================================
REM  Liga Comercial - instalacao no computador do vendedor
REM
REM  Cria:
REM    - atalho na area de trabalho
REM    - inicializacao automatica junto com o Windows (minimizada)
REM    - janela pequena e independente, que nao atrapalha o trabalho
REM
REM  Nao instala programa nenhum: usa o Chrome ou o Edge que ja existe.
REM ============================================================
title Liga Comercial - Instalacao
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-atalho.ps1"
if errorlevel 1 (
  echo.
  echo Algo deu errado. Chame o gestor e mostre a mensagem acima.
  pause
)
