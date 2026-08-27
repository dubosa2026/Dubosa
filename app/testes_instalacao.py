"""O app tem mesmo cara de aplicativo instalado?

    python3 app/testes_instalacao.py

Sobe a pasta `app/dist` num servidor local (localhost conta como endereco
seguro, entao o service worker e o microfone funcionam iguais ao site
publicado) e confere as promessas que a tela de inicio do celular depende:

- o manifesto carrega e pede tela cheia (`standalone`);
- os icones PNG existem e sao do tamanho certo — sem eles o Chrome do
  Android oferece um atalho de navegador em vez de "Instalar aplicativo";
- o service worker registra e ATIVA;
- com a rede cortada, o app ainda abre.

Este ultimo e o teste que importa de verdade: um app de gasto que so abre
com internet falha exatamente na fila do mercado.
"""
import functools
import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

DIST = Path(__file__).resolve().parent / "dist"
falhas, feitas = [], []


def ok(cond, nome, extra=""):
    feitas.append(nome)
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else "  -> " + str(extra)))
    if not cond:
        falhas.append(nome)


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


manipulador = functools.partial(Silencioso, directory=str(DIST))
socketserver.TCPServer.allow_reuse_address = True
servidor = socketserver.TCPServer(("127.0.0.1", 0), manipulador)
porta = servidor.server_address[1]
threading.Thread(target=servidor.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d/" % porta

with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                          has_touch=True, locale="pt-BR", service_workers="allow")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(BASE, wait_until="networkidle")

    print("\n== o manifesto ==")
    m = json.loads(pg.evaluate("""async () => {
      const l = document.querySelector('link[rel=manifest]');
      return l ? await (await fetch(l.href)).text() : 'null';
    }"""))
    ok(m and m.get("display") == "standalone",
       "pede tela cheia (é o que tira a barra do navegador)", m.get("display") if m else None)
    ok(m.get("name") and m.get("short_name") == "Bússola", "tem nome e nome curto", m.get("short_name"))
    ok(m.get("start_url") and m.get("scope"), "tem endereço de partida e escopo")

    pngs = [i for i in m.get("icons", []) if i.get("type") == "image/png"]
    grandes = [i for i in pngs if int(i["sizes"].split("x")[0]) >= 192]
    ok(len(grandes) >= 2, "tem ícone PNG de 192px ou mais (exigência para instalar)",
       [i["sizes"] for i in pngs])
    ok(any(i.get("purpose") == "maskable" for i in pngs),
       "tem ícone 'maskable' (o Android recorta o ícone e cortaria a agulha)")

    print("\n== os arquivos existem mesmo ==")
    for nome in ["icone-192.png", "icone-512.png", "icone-maskable-512.png", "apple-touch-icon.png"]:
        r = pg.request.get(BASE + nome)
        ok(r.status == 200 and r.headers.get("content-type", "").startswith("image/png"),
           "%s responde 200 e é PNG" % nome, r.status)

    tamanhos = pg.evaluate("""async () => {
      const medir = (u) => new Promise((ok) => { const i = new Image();
        i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok([0,0]); i.src = u; });
      return { p192: await medir('icone-192.png'), p512: await medir('icone-512.png'),
               apple: await medir('apple-touch-icon.png') };
    }""")
    ok(tamanhos["p192"] == [192, 192], "o ícone de 192 tem 192px de verdade", tamanhos["p192"])
    ok(tamanhos["p512"] == [512, 512], "o de 512 idem", tamanhos["p512"])
    ok(tamanhos["apple"] == [180, 180], "o do iPhone tem 180px", tamanhos["apple"])

    ok(pg.evaluate("() => !!document.querySelector('link[rel=apple-touch-icon]')"),
       "o iPhone acha o ícone dele (o Safari ignora o manifesto para isso)")

    print("\n== o service worker ==")
    ativo = pg.evaluate("""async () => {
      const r = await navigator.serviceWorker.ready;
      return !!(r && r.active);
    }""")
    ok(ativo is True, "registra e fica ativo", ativo)

    print("\n== sem internet ==")
    # Corta a rede de vez: qualquer pedido que saia do aparelho falha.
    ctx.set_offline(True)
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(600)
    ok(pg.is_visible("#mic"), "o app abre com a rede cortada")
    ok("Bússola" in pg.title(), "com o título certo", pg.title())
    ok(pg.evaluate("() => document.querySelectorAll('.aba').length") == 4,
       "com as quatro abas de pé")
    pg.click(".aba[data-pane=futuro]")
    pg.wait_for_timeout(300)
    ok("Para onde isso vai" in pg.inner_text("#pane-futuro"), "e as telas continuam funcionando")
    ctx.set_offline(False)

    print("\n== uma correção chega no aparelho ==")
    # O app estava servindo a pagina do cache. Na pratica isso significava
    # que um defeito corrigido aqui podia continuar de pe no celular. Agora
    # a pagina vem pela rede quando ha rede — e do cache quando nao ha.
    alvo = DIST / "index.html"
    original = alvo.read_text(encoding="utf-8")
    try:
        alvo.write_text(original.replace("<title>", "<title>CORRIGIDO "), encoding="utf-8")
        pg.goto(BASE, wait_until="domcontentloaded")
        pg.wait_for_timeout(500)
        ok("CORRIGIDO" in pg.title(), "com internet, a versão nova aparece na hora", pg.title())
    finally:
        alvo.write_text(original, encoding="utf-8")
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(400)

    print("\n== nada quebrado ==")
    ok(not erros, "nenhum erro de javascript", erros[:3])

    nav.close()

servidor.shutdown()
if falhas:
    print("\n%d verificações, %d falhas: %s" % (len(feitas), len(falhas), ", ".join(falhas)))
    sys.exit(1)
print("\n%d verificações, nenhuma falha." % len(feitas))
