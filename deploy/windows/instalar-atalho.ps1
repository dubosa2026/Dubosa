<#
  Liga Comercial - criacao do atalho e da inicializacao automatica.

  O aplicativo abre em "modo aplicativo" do navegador: janela propria, sem barra
  de enderecos e sem abas. Um perfil dedicado garante que a janela abra sempre
  no tamanho pedido, sem se misturar com a navegacao pessoal.
#>

$ErrorActionPreference = 'Stop'
$Nome        = 'Liga Comercial'
$PastaPerfil = Join-Path $env:LOCALAPPDATA 'LigaComercial\perfil'
$Largura     = 430
$Altura      = 780

function Escrever($texto, $cor = 'White') { Write-Host $texto -ForegroundColor $cor }

Escrever ''
Escrever '  LIGA COMERCIAL - instalacao' 'Cyan'
Escrever '  ---------------------------' 'Cyan'
Escrever ''

# ---------------------------------------------------------------- 1. o link
$arquivoLink = Join-Path $PSScriptRoot 'LINK.txt'
if (Test-Path $arquivoLink) {
  $link = (Get-Content $arquivoLink -Raw).Trim()
  Escrever "  Link encontrado em LINK.txt" 'DarkGray'
} else {
  Escrever '  Cole abaixo o SEU link pessoal (o gestor enviou para voce).'
  Escrever '  Ele tem esta cara: https://...../#/v/XXXX-XXXX-XXXX' 'DarkGray'
  Escrever ''
  $link = (Read-Host '  Link').Trim()
}

if ([string]::IsNullOrWhiteSpace($link) -or $link -notmatch '^https?://') {
  Escrever ''
  Escrever '  Link invalido. Ele precisa comecar com http:// ou https://' 'Red'
  exit 1
}

# ------------------------------------------------------------ 2. o navegador
$candidatos = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $navegador) {
  Escrever ''
  Escrever '  Nao encontrei o Chrome nem o Edge neste computador.' 'Red'
  Escrever '  Instale um dos dois e rode este instalador de novo.' 'Red'
  exit 1
}
Escrever "  Navegador: $(Split-Path $navegador -Leaf)" 'DarkGray'

# --------------------------------------------------------------- 3. atalhos
New-Item -ItemType Directory -Force -Path $PastaPerfil | Out-Null

$argumentos = "--app=`"$link`" --user-data-dir=`"$PastaPerfil`" --window-size=$Largura,$Altura --no-first-run --no-default-browser-check"

function CriarAtalho($destino, $minimizado) {
  $shell = New-Object -ComObject WScript.Shell
  $atalho = $shell.CreateShortcut($destino)
  $atalho.TargetPath       = $navegador
  $atalho.Arguments        = $argumentos
  $atalho.WorkingDirectory = Split-Path $navegador
  $atalho.IconLocation     = "$navegador,0"
  $atalho.Description      = 'Liga Comercial - seu placar do dia'
  # 7 = janela minimizada: abre junto com o Windows sem roubar a tela.
  $atalho.WindowStyle      = if ($minimizado) { 7 } else { 1 }
  $atalho.Save()
}

$areaTrabalho = [Environment]::GetFolderPath('Desktop')
$atalhoDesktop = Join-Path $areaTrabalho "$Nome.lnk"
CriarAtalho $atalhoDesktop $false
Escrever "  Atalho criado na area de trabalho" 'Green'

$pastaInicializar = [Environment]::GetFolderPath('Startup')
$atalhoInicio = Join-Path $pastaInicializar "$Nome.lnk"
CriarAtalho $atalhoInicio $true
Escrever "  Inicializacao automatica configurada (abre minimizado)" 'Green'

# ---------------------------------------------------------------- 4. pronto
Escrever ''
Escrever '  Tudo pronto.' 'Green'
Escrever ''
Escrever '  - Icone na area de trabalho: abre o seu placar.'
Escrever '  - Ao ligar o computador ele abre sozinho, ja minimizado.'
Escrever '  - Dentro do aplicativo, o botao "Compacto" deixa a janela minima,'
Escrever '    do tamanho de um cronometro, para ficar de lado durante o dia.'
Escrever ''
Escrever '  Para remover tudo: Desinstalar-Dubosa.bat' 'DarkGray'
Escrever ''

$abrir = Read-Host '  Abrir agora? (S/N)'
if ($abrir -match '^[SsYy]') { Start-Process -FilePath $navegador -ArgumentList $argumentos }
