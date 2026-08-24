"""Os dois recursos que ficam prontos, mas escondidos.

O gestor pediu para deixar a programacao pronta e nao mostrar nada ainda:

  1. A pergunta a IA some da tela com IA_LIGADA=0, SEM tirar a
     ANTHROPIC_API_KEY do site. E some de verdade: a funcao tambem recusa a
     pergunta, senao bastaria abrir o console do navegador para gastar de um
     campo "escondido".
  2. A agenda nao fala em e-mail enquanto o lembrete nao estiver ligado --
     nem para prometer, nem para avisar que nao vai sair.

Roda num servidor proprio, com o ambiente desligado, ao lado do normal.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

PORTA = os.environ.get("PORTA_DESLIGADO", "8896")
BASE = f"http://localhost:{PORTA}"
SENHA = "senha-de-teste"
SANDBOX = os.environ.get("SANDBOX")
falhas = []


def ok(cond, nome, extra=""):
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else f"  -> {extra}"))
    if not cond:
        falhas.append(nome)


def api(caminho, corpo, admin=False):
    req = urllib.request.Request(
        BASE + caminho, data=json.dumps(corpo).encode(),
        headers={"content-type": "application/json",
                 **({"x-admin-token": SENHA} if admin else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


if not SANDBOX:
    print("defina SANDBOX com a pasta montada como no README.md")
    raise SystemExit(2)

servidor = subprocess.Popen(
    ["node", "servidor.mjs"], cwd=SANDBOX,
    stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    env={**os.environ, "ADMIN_TOKEN": SENHA, "PORTA": PORTA,
         # A chave da API CONTINUA no site. O que desliga e a outra variavel.
         "ANTHROPIC_API_KEY": "sk-ant-teste",
         "IA_LIGADA": "0",
         # Nenhuma configuracao de e-mail: o lembrete nao esta ligado.
         "BREVO_API_KEY": "", "EMAIL_REMETENTE": "", "EMAIL_GESTOR": ""})
try:
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/", timeout=1)
            break
        except Exception:
            time.sleep(0.25)

    SUF = "-off-" + str(int(time.time()))
    V = "VITOR DESLIGADO" + SUF
    _, r = api("/api/publicar", {
        "vendedor": V, "uf": "PA", "modo": "normal", "email": "vitor@belenergy.com.br",
        "rotulo": "Distribuição de carteira",
        "colunas": ["Integrador (CLI - Nome)", "Cidade", "UF", "Telefone"],
        "linhas": [{"Integrador (CLI - Nome)": "CLI-0000000101 - SOLAR NORTE",
                    "Cidade": "BELÉM", "UF": "PA", "Telefone": "(91) 98888-0001"}]},
        admin=True)
    tok = r["token"]

    print("1. a IA desligada, com a chave da API ainda no site")
    st, s = api("/api/duvida", {"token": tok, "acao": "saldo"})
    ok(s.get("ligado") is False, "o saldo diz que está desligada", s)

    st, d = api("/api/duvida", {"token": tok,
                                "pergunta": "ele disse que vai esperar a feira"})
    ok(st == 503, "e perguntar direto pela API é recusado", (st, d))
    ok("desligada" in json.dumps(d, ensure_ascii=False),
       "com o motivo certo, não 'falta a chave'", d)

    print("\n2. a agenda não fala em e-mail")
    quando = time.strftime("%Y-%m-%dT%H:%M:%S.000Z",
                           time.gmtime(time.time() + 3600))
    st, a = api("/api/agenda", {"token": tok, "acao": "somar", "cliente": "CLI101",
                                "nome": "CLI-0000000101 - SOLAR NORTE",
                                "quando": quando, "obs": "Combinado."})
    ok(st == 200, "agendar continua funcionando", (st, a))
    ok(a["avisa"] is False, "e a tela sabe que não há lembrete", a.get("avisa"))

    print("\n3. na tela do vendedor")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        pg = b.new_context(viewport={"width": 1400, "height": 1000}).new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"{BASE}/c/#{tok}")
        pg.wait_for_timeout(1800)

        pg.click("[data-rtaba='obj']")
        pg.wait_for_timeout(400)
        ok(pg.evaluate("document.getElementById('rtIa').hidden"),
           "o campo 'Pergunte à IA' não aparece")
        ok("Pergunte à IA" not in pg.inner_text("#rtObj"),
           "nem o rótulo dele", pg.inner_text("#rtObj")[-160:])
        ok(len(pg.query_selector_all(".rt-obj")) > 0 or
           "frete" in pg.inner_text("#rtObj").lower(),
           "mas os cenários prontos continuam lá")

        pg.click("[data-rtaba='agenda']")
        pg.wait_for_timeout(400)
        texto = pg.inner_text("#rtAgenda")
        ok("gestor" not in texto.lower(), "nenhum 'fale com o seu gestor'", texto[:200])
        ok("mail" not in texto.lower(), "nenhuma menção a e-mail", texto[:200])
        ok(len(pg.query_selector_all(".rt-ag-item")) == 1,
           "e o compromisso está na lista, normalmente",
           len(pg.query_selector_all(".rt-ag-item")))
        ok(not errs, "sem erro de console", errs)
        b.close()
finally:
    servidor.terminate()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
sys.exit(1 if falhas else 0)
