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
import hashlib
import json
import shutil
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SRC = RAIZ / "src"
FONTES = SRC / "fonts"
SAIDA_ARQUIVO = RAIZ / "bussola.html"
DIST = RAIZ / "dist"
ICONES = SRC / "icones"
# O GitHub Pages so publica a raiz do repositorio ou uma pasta chamada
# `docs/`. Como o Netlify publica `app/dist`, o build escreve nos dois
# lugares: assim da para hospedar em qualquer um dos dois, de graca, sem
# mexer em nada. O conteudo e identico.
DOCS = RAIZ.parent / "docs"

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

# `display: standalone` e o que tira a barra do navegador: aberto pelo icone,
# ele ocupa a tela inteira, com a propria janela na lista de aplicativos
# recentes. Os PNGs sao o que faz o Chrome do Android oferecer "Instalar
# aplicativo" em vez de um atalho — e o `maskable` e o que impede o recorte
# do sistema de cortar a agulha da bussola.
MANIFESTO = {
    "name": "Bússola — assessor financeiro",
    "short_name": "Bússola",
    "description": "Fale o gasto e veja quanto ainda dá para gastar hoje, na semana, no mês e no ano.",
    "id": "bussola",
    "start_url": ".",
    "scope": ".",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#0A0A0B",
    "theme_color": "#0A0A0B",
    "lang": "pt-BR",
    "dir": "ltr",
    "categories": ["finance", "productivity"],
    "icons": [
        {"src": "icone-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icone-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icone-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        {"src": FAVICON, "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
    ],
}

# Arquivos que o build so copia de src/icones para dist/.
COPIAR = ["icone-192.png", "icone-512.png", "icone-maskable-512.png", "apple-touch-icon.png"]

# Cache-first, com atualizacao por tras. O app precisa abrir no elevador,
# no metro e no meio do mato: se depender da rede para desenhar a tela, ele
# falha justamente na hora em que a pessoa quer lancar um gasto.
SERVICE_WORKER = """/* Service worker da Bússola: o app abre sem internet.
 *
 * Duas estrategias, de proposito.
 *
 * A PAGINA vem pela REDE primeiro. Ela carrega o app inteiro — telas,
 * contas, interpretacao da voz —, entao servi-la do cache faria uma
 * correcao levar dias para chegar ao celular. Ja aconteceu: um defeito da
 * voz corrigido aqui continuaria repetindo lancamento no aparelho. Sem
 * rede, o cache assume na hora e o app abre igual.
 *
 * O RESTO (icones) vem do cache primeiro, atualizando por tras: sao
 * arquivos que quase nunca mudam, e esperar a rede por eles so atrasaria a
 * tela.
 *
 * Nenhum lancamento passa por aqui — eles ficam no armazenamento do
 * aparelho e nunca viram rede.
 */
const CACHE = 'bussola-__VERSAO__';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest',
  './icone-192.png', './icone-512.png', './icone-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((ns) => Promise.all(ns.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

function guardar(pedido, resposta) {
  if (resposta && resposta.ok) {
    const copia = resposta.clone();
    caches.open(CACHE).then((c) => c.put(pedido, copia));
  }
  return resposta;
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // A analise da IA nunca sai do cache: resposta velha de conselho e pior
  // que resposta nenhuma.
  if (ev.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  if (ev.request.mode === 'navigate') {
    // `cache: 'reload'` pula o cache HTTP do proprio navegador. Sem isso a
    // busca pela rede ainda podia devolver a pagina velha: o GitHub Pages
    // manda a pagina com validade de alguns minutos, e o navegador honra
    // essa validade antes mesmo de perguntar ao servidor. Uma correcao
    // ficava presa nesse meio do caminho.
    ev.respondWith(
      fetch(ev.request, { cache: 'reload' })
        .then((r) => guardar(ev.request, r))
        .catch(() => caches.match(ev.request).then((achado) => achado || caches.match('./index.html'))),
    );
    return;
  }

  ev.respondWith(caches.match(ev.request).then((achado) => {
    const rede = fetch(ev.request).then((r) => guardar(ev.request, r)).catch(() => achado);
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
<meta name="bussola-versao" content="{versao}">
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


def versao_das_fontes() -> str:
    """Impressao digital do que o app e, hoje.

    Serve para duas coisas: nomear o cache do service worker (que precisa
    mudar quando — e so quando — o app muda) e aparecer no rodape dos
    Ajustes. Este segundo uso nasceu de um aperto real: com o app no celular
    repetindo lancamento, nao havia como saber se a correcao ja tinha
    chegado ou se ela e que nao funcionava. Um numero na tela responde isso
    em dois segundos.
    """
    juntos = "".join(
        (SRC / nome).read_text(encoding="utf-8") for nome in MODULOS
    ) + (SRC / "app_shell.html").read_text(encoding="utf-8")
    return hashlib.sha1(juntos.encode("utf-8")).hexdigest()[:8]


def b64(nome: str) -> str:
    return base64.b64encode((FONTES / nome).read_bytes()).decode("ascii")


def montar(shell: str, extra_head: str, extra_body: str, versao: str = "") -> str:
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
        versao=versao,
        extra_head=extra_head,
        cabeca=cabeca,
        corpo=corpo + "\n" + script,
        extra_body=extra_body,
    )


def main() -> None:
    shell = (SRC / "app_shell.html").read_text(encoding="utf-8")
    versao = versao_das_fontes()
    for marcador, fonte in SUBSTITUICOES.items():
        shell = shell.replace(marcador, b64(fonte))

    # Versao arquivo unico: nada de manifesto nem service worker, que
    # dependem de um servidor e so renderiam 404 no console.
    SAIDA_ARQUIVO.write_text(montar(shell, "", "", versao), encoding="utf-8")

    # O iPhone ignora o manifesto para o icone da tela de inicio: ele quer o
    # `apple-touch-icon`, e so em PNG. Sem esta linha, o Safari recorta a
    # propria tela do app e usa como icone.
    cabeca_dist = ('<link rel="manifest" href="manifest.webmanifest">\n'
                   '<link rel="apple-touch-icon" href="apple-touch-icon.png">')
    html_dist = montar(shell, cabeca_dist, REGISTRO_SW, versao)
    manifesto = json.dumps(MANIFESTO, ensure_ascii=False, indent=2)

    sw = SERVICE_WORKER.replace("__VERSAO__", versao)

    for pasta in (DIST, DOCS):
        pasta.mkdir(parents=True, exist_ok=True)
        for nome in COPIAR:
            shutil.copy2(ICONES / nome, pasta / nome)
        (pasta / "index.html").write_text(html_dist, encoding="utf-8")
        (pasta / "manifest.webmanifest").write_text(manifesto, encoding="utf-8")
        (pasta / "sw.js").write_text(sw, encoding="utf-8")

    # O GitHub Pages passa tudo pelo Jekyll por padrao, que ignora arquivo
    # comecado por ponto ou sublinhado. Este arquivo vazio o desliga.
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")

    for arq in (SAIDA_ARQUIVO, DIST / "index.html", DOCS / "index.html"):
        print("%-26s %6.0f KB" % (arq.relative_to(RAIZ.parent), arq.stat().st_size / 1024))
    print("(+ manifesto, service worker e ícones em app/dist/ e docs/)")
    print("versão: %s" % versao)


if __name__ == "__main__":
    main()
