"""Junta os fontes de app/src/ num unico arquivo HTML autocontido.

    python3 app/build_app.py

Gera dois arquivos com o mesmo conteudo e destinos diferentes:

- `app/bussola.html`  — o app inteiro em um arquivo so. Abre com dois
  cliques, funciona offline, cabe num anexo de mensagem. E a versao para
  quem nao quer publicar nada em lugar nenhum.
- `app/dist/index.html` — a mesma coisa, mas com o manifesto e o service
  worker do lado, para instalar na tela de inicio do celular e abrir sem
  barra de navegador. E a versao publicada.

As fontes .woff2 entram embutidas em base64: o HTML abre sem CDN, sem
internet e sem instalar nada.
"""

import base64
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SRC = RAIZ / "src"
FONTES = SRC / "fonts"
SAIDA_ARQUIVO = RAIZ / "bussola.html"
DIST = RAIZ / "dist"

# A rosa dos ventos da marca, embutida como data URI. Sem ela o navegador
# pede /favicon.ico em toda visita, leva 404 e escreve erro no console — e
# este app fica aberto na tela de inicio do celular, com icone e tudo.
FAVICON = (
    "data:image/svg+xml,"
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
    "%3Crect width='32' height='32' rx='7' fill='%230A0A0B'/%3E"
    "%3Ccircle cx='16' cy='16' r='11' fill='none' stroke='%233A3A43' stroke-width='2'/%3E"
    "%3Cpath d='M22 10 L13.5 13 L10 22 L18.5 19 Z' fill='%23FFC72C'/%3E"
    "%3Ccircle cx='16' cy='16' r='1.6' fill='%230A0A0B'/%3E"
    "%3C/svg%3E"
)

# Ordem importa: cada arquivo usa o anterior. formato -> nucleo -> voz ->
# conselhos -> ui.
MODULOS = ["formato.js", "nucleo.js", "voz.js", "conselhos.js", "ui.js"]

SUBSTITUICOES = {
    "__ARCHIVO__": "archivo-var.woff2",
    "__PLEXSANS__": "plexsans-var.woff2",
    "__PLEXMONO400__": "plexmono-400.woff2",
    "__PLEXMONO600__": "plexmono-600.woff2",
}

MANIFESTO = {
    "name": "Bússola — assessor financeiro",
    "short_name": "Bússola",
    "start_url": ".",
    "scope": ".",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#0A0A0B",
    "theme_color": "#0A0A0B",
    "lang": "pt-BR",
    "icons": [
        {"src": FAVICON, "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
    ],
}

# Cache-first, com atualizacao por tras. O app precisa abrir no elevador,
# no metro e no meio do mato: se depender da rede para desenhar a tela, ele
# falha justamente na hora em que a pessoa quer lancar um gasto.
SERVICE_WORKER = """/* Service worker da Bússola: o app abre sem internet.
 *
 * Estrategia: responde do cache na hora e busca a versao nova por tras. A
 * proxima abertura ja pega a atualizacao. Nenhum dado de lancamento passa
 * por aqui — eles ficam no localStorage do aparelho e nunca viram rede.
 */
const CACHE = 'bussola-__VERSAO__';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((ns) => Promise.all(ns.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // A analise da IA nunca sai do cache: resposta velha de conselho e pior
  // que resposta nenhuma.
  if (ev.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  ev.respondWith(caches.match(ev.request).then((achado) => {
    const rede = fetch(ev.request).then((r) => {
      if (r && r.ok) caches.open(CACHE).then((c) => c.put(ev.request, r.clone()));
      return r;
    }).catch(() => achado);
    return achado || rede;
  }));
});
"""

ESQUELETO = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A0A0B">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Assessor financeiro de bolso: fale seus gastos, veja a projeção do dia, da semana, do mês e do ano.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Bússola">
<link rel="icon" href="{favicon}">
{extra_head}
{cabeca}
</head>
<body>
{corpo}
{extra_body}
</body>
</html>
"""

REGISTRO_SW = """<script>
/* O app so vira "aplicativo instalado" com o service worker no ar. Falha
   aqui nao pode derrubar a tela: sem ele o app continua funcionando, so
   perde o modo offline. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
</script>"""


def b64(nome: str) -> str:
    return base64.b64encode((FONTES / nome).read_bytes()).decode("ascii")


def montar(shell: str, extra_head: str, extra_body: str) -> str:
    corte = shell.index("</style>") + len("</style>")
    cabeca, corpo = shell[:corte], shell[corte:]

    # Cada modulo entra dentro da sua propria funcao. Sem isso, o `var F` do
    # nucleo e o `const F` da interface colidem no escopo global e o
    # navegador recusa o arquivo inteiro com um erro de sintaxe.
    partes = []
    for nome in MODULOS:
        fonte = (SRC / nome).read_text(encoding="utf-8")
        partes.append("/* ==== %s ==== */\n(function(){\n%s\n})();" % (nome, fonte))
    script = "<script>\n" + "\n\n".join(partes) + "\n</script>"

    return ESQUELETO.format(
        favicon=FAVICON,
        extra_head=extra_head,
        cabeca=cabeca,
        corpo=corpo + "\n" + script,
        extra_body=extra_body,
    )


def main() -> None:
    shell = (SRC / "app_shell.html").read_text(encoding="utf-8")
    for marcador, fonte in SUBSTITUICOES.items():
        shell = shell.replace(marcador, b64(fonte))

    # Versao arquivo unico: nada de manifesto nem service worker, que
    # dependem de um servidor e so renderiam 404 no console.
    SAIDA_ARQUIVO.write_text(montar(shell, "", ""), encoding="utf-8")

    DIST.mkdir(parents=True, exist_ok=True)
    (DIST / "index.html").write_text(
        montar(shell, '<link rel="manifest" href="manifest.webmanifest">', REGISTRO_SW),
        encoding="utf-8",
    )
    (DIST / "manifest.webmanifest").write_text(
        json.dumps(MANIFESTO, ensure_ascii=False, indent=2), encoding="utf-8")

    # A versao do cache muda junto com o conteudo: sem isso o celular
    # continuaria servindo a tela velha depois de uma correcao.
    versao = str(abs(hash((SRC / "ui.js").read_text(encoding="utf-8")
                          + (SRC / "nucleo.js").read_text(encoding="utf-8"))))[:10]
    (DIST / "sw.js").write_text(SERVICE_WORKER.replace("__VERSAO__", versao), encoding="utf-8")

    for arq in (SAIDA_ARQUIVO, DIST / "index.html"):
        print("%-26s %6.0f KB" % (arq.relative_to(RAIZ.parent), arq.stat().st_size / 1024))
    print("app/dist/manifest.webmanifest, app/dist/sw.js")


if __name__ == "__main__":
    main()
