/**
 * INSTALADOR DE UM ARQUIVO SÓ
 * ===========================
 *
 * O que o vendedor precisa está pronto desde o começo: janela própria de 430
 * por 780, sem barra de endereços nem abas, atalho na área de trabalho e
 * abertura junto com o Windows, já minimizada. O que faltava era ENTREGAR.
 *
 * A instalação vivia numa pasta do repositório, e o passo um era "baixe a
 * pasta deploy/windows do GitHub" — coisa que nenhum vendedor vai fazer. Aqui
 * o gestor gera um arquivo por pessoa, com o link dela já dentro, e manda pelo
 * WhatsApp. Do outro lado são dois cliques.
 *
 * O ARQUIVO É UM .BAT QUE CARREGA POWERSHELL. O truque de ler o próprio
 * arquivo e executar o que vem depois do marcador existe por um motivo: passar
 * PowerShell como argumento de linha de comando exige escapar aspas dentro de
 * aspas, e o link e os caminhos do Windows são cheios de aspas. Uma barra
 * invertida a mais e o instalador quebra na máquina de alguém, longe daqui.
 * Assim o PowerShell fica em texto puro, exatamente como foi escrito.
 */

/** Tamanho da janela — cabe ao lado de uma planilha aberta, sem tapar nada. */
export const JANELA = Object.freeze({ largura: 430, altura: 780 });

/** Nome de arquivo seguro, sem acento nem espaço, para viajar por WhatsApp. */
export function nomeDeArquivo(nome) {
  const limpo = String(nome ?? 'vendedor')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `Liga-Comercial-${limpo || 'vendedor'}.bat`;
}

/**
 * Conteúdo do instalador para uma pessoa.
 *
 * @param {{link: string, nome?: string}} destinatario
 * @returns {string} texto do .bat, pronto para download
 */
export function instaladorWindows({ link, nome = '' }) {
  if (!/^https?:\/\//.test(String(link ?? ''))) {
    throw new Error('O instalador precisa de um link completo, começando com https://');
  }
  // O link entra numa string PowerShell de aspas simples: a única coisa que
  // precisa ser escapada ali é a própria aspa simples.
  const linkPS = String(link).replace(/'/g, "''");
  const paraQuem = nome ? ` de ${nome}` : '';

  return paraWindows(`@echo off
REM ============================================================
REM  Liga Comercial${paraQuem}
REM
REM  De dois cliques neste arquivo. Ele cria o atalho na area de
REM  trabalho e faz o placar abrir junto com o Windows, ja
REM  minimizado, numa janela pequena de ${JANELA.largura}x${JANELA.altura}.
REM
REM  Se o Windows avisar que o arquivo veio da internet, clique em
REM  "Mais informacoes" e depois em "Executar assim mesmo".
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0');iex ($t.Substring($t.LastIndexOf('#INICIO-POWERSHELL#')+19))"
exit /b
#INICIO-POWERSHELL#
$ErrorActionPreference = 'Stop'
try {
$link   = '${linkPS}'
$nome   = 'Liga Comercial'
$perfil = Join-Path $env:LOCALAPPDATA 'LigaComercial\\perfil'

Write-Host ''
Write-Host '  LIGA COMERCIAL' -ForegroundColor Cyan
Write-Host '  --------------' -ForegroundColor Cyan
Write-Host ''

# O modo aplicativo (--app) so existe no Chrome e no Edge. E ele que da a
# janela sem barra de enderecos e sem abas.
$candidatos = @(
  (Join-Path $env:ProgramFiles 'Google\\Chrome\\Application\\chrome.exe'),
  (Join-Path \${env:ProgramFiles(x86)} 'Google\\Chrome\\Application\\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\\Chrome\\Application\\chrome.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\\Edge\\Application\\msedge.exe'),
  (Join-Path \${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe')
)
$navegador = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $navegador) {
  Write-Host '  Nao encontrei o Chrome nem o Edge neste computador.' -ForegroundColor Red
  Write-Host '  Instale um dos dois e rode este arquivo de novo.' -ForegroundColor Red
  Write-Host ''
  Read-Host '  Enter para fechar' | Out-Null
  exit 1
}

New-Item -ItemType Directory -Force -Path $perfil | Out-Null

# Perfil proprio: a janela abre sempre do mesmo tamanho e o acesso do
# vendedor nao se mistura com a navegacao pessoal dele.
$argumentos = '--app="' + $link + '" --user-data-dir="' + $perfil + '" --window-size=${JANELA.largura},${JANELA.altura} --no-first-run --no-default-browser-check'
$shell = New-Object -ComObject WScript.Shell

function CriarAtalho($pasta, $estilo) {
  $atalho = $shell.CreateShortcut((Join-Path $pasta ($nome + '.lnk')))
  $atalho.TargetPath       = $navegador
  $atalho.Arguments        = $argumentos
  $atalho.WorkingDirectory = Split-Path $navegador
  $atalho.IconLocation     = "$navegador,0"
  $atalho.Description      = 'Liga Comercial - seu placar do dia'
  $atalho.WindowStyle      = $estilo
  $atalho.Save()
}

CriarAtalho ([Environment]::GetFolderPath('Desktop')) 1
Write-Host '  Atalho criado na area de trabalho.' -ForegroundColor Green

# 7 = minimizada. Abre junto com o Windows sem roubar a tela de ninguem.
CriarAtalho ([Environment]::GetFolderPath('Startup')) 7
Write-Host '  Vai abrir sozinho ao ligar o computador, ja minimizado.' -ForegroundColor Green

Write-Host ''
Write-Host '  Dentro do aplicativo, o botao Compacto deixa a janela do tamanho'
Write-Host '  de um cronometro, para ficar de lado durante o dia.'
Write-Host ''
Start-Process -FilePath $navegador -ArgumentList $argumentos
Write-Host '  Abrindo...' -ForegroundColor Green
Start-Sleep -Seconds 3
}
catch {
  Write-Host ''
  Write-Host '  Nao consegui concluir a instalacao.' -ForegroundColor Red
  Write-Host ("  " + $_.Exception.Message) -ForegroundColor Red
  Write-Host ''
  Write-Host '  Mande esta mensagem para quem enviou o arquivo.' -ForegroundColor DarkGray
  Write-Host ''
  Read-Host '  Enter para fechar' | Out-Null
}
`);
}

/**
 * Fim de linha do Windows.
 *
 * Não é detalhe de estilo: um `.bat` gravado com as quebras de linha do
 * Unix não executa. O navegador gera o arquivo exatamente como o texto foi
 * escrito, e este projeto é escrito em Linux — o arquivo chegava com LF, o
 * Windows não fazia nada, e não havia mensagem nenhuma para explicar.
 */
function paraWindows(texto) {
  return texto.replace(/\r?\n/g, '\r\n');
}
