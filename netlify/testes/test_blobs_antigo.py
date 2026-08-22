"""O caderno num runtime SEM escrita condicional.

A escrita condicional (onlyIfMatch / onlyIfNew) so existe no @netlify/blobs
a partir da 8.1. Num runtime anterior a chamada e aceita, a trava e ignorada
e nao volta `modified` nenhum -- e foi exatamente isso que aconteceu em
producao: o vendedor apertava "Salvar anotação", via "Não consegui salvar
agora" e o texto era gravado UMA VEZ POR TENTATIVA, seis copias por clique.

Este roteiro sobe um servidor com o stub em modo antigo (BLOBS_SEM_CONDICIONAL)
e cobra o comportamento certo: salvar funciona, e salva uma vez so.

Precisa do sandbox montado como no README, e roda numa porta propria para
poder conviver com o servidor normal.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORTA = os.environ.get("PORTA_ANTIGO", "8898")
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
         "BLOBS_SEM_CONDICIONAL": "1"})
try:
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/", timeout=1)
            break
        except Exception:
            time.sleep(0.25)

    SUF = "-antigo-" + str(int(time.time()))
    COLUNAS = ["Integrador (CLI - Nome)", "Cidade", "UF", "Telefone"]
    linha = {"Integrador (CLI - Nome)": "CLI-0000100379 - SMART SOL",
             "Cidade": "ARAGUAINA", "UF": "TO", "Telefone": "(63) 98888-0001"}

    print("runtime sem escrita condicional (@netlify/blobs anterior à 8.1)")
    _, r = api("/api/publicar", {
        "vendedor": "NILTON" + SUF, "uf": "TO", "modo": "normal",
        "rotulo": "Distribuição de carteira", "colunas": COLUNAS,
        "linhas": [linha]}, admin=True)
    tok = r["token"]

    st, a = api("/api/anotacoes", {"token": tok, "acao": "somar", "cliente": "CLI100379",
                                   "data": "22/08/2026", "texto": "Ligou de volta."})
    ok(st == 200, "a PRIMEIRA anotação salva (blob ainda não existe)", (st, a))
    ok(len(a.get("notas", [])) == 1, "e salva UMA vez, não uma por tentativa",
       len(a.get("notas", [])))

    st, b = api("/api/anotacoes", {"token": tok, "acao": "somar", "cliente": "CLI100379",
                                   "data": "22/08/2026", "texto": "Fecha em setembro."})
    ok(st == 200, "a SEGUNDA também (blob já existe)", (st, b))
    ok(len(b.get("notas", [])) == 2, "duas anotações, nem uma a mais",
       len(b.get("notas", [])))

    st, c = api("/api/anotacoes", {"token": tok, "acao": "editar", "cliente": "CLI100379",
                                   "indice": 0, "data": "21/08/2026", "texto": "Corrigido."})
    ok(st == 200 and c["notas"][0]["texto"] == "Corrigido.", "editar funciona", (st, c))

    st, d = api("/api/anotacoes", {"token": tok, "acao": "apagar",
                                   "cliente": "CLI100379", "indice": 0})
    ok(st == 200 and len(d["notas"]) == 1, "apagar funciona", (st, d))

    _, e = api("/api/anotacoes", {"token": tok, "acao": "listar"})
    ok(len(e["notas"].get("CLI100379", [])) == 1, "e o que ficou guardado confere",
       e["notas"])
finally:
    servidor.terminate()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
sys.exit(1 if falhas else 0)
