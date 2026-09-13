"""Gerar abordagem (/api/abordagem): o mesmo padrão de duvida.mjs, para
uma rota nova — orçamento próprio, mesma trava-mestra IA_LIGADA, e a
resposta precisa vir no formato que a tela do vendedor espera.

Diferente dos outros testes deste diretório, este monta o PRÓPRIO sandbox
(em vez de depender de um `SANDBOX` já preparado por fora), porque também
precisa instalar o substituto de `@anthropic-ai/sdk` — o pacote real nunca
foi instalado neste checkout, e sem o substituto o servidor nem sobe
(a importação em `abordagem.mjs`/`duvida.mjs` é estática, no topo do
arquivo). O substituto já existia em `anthropic_falso.mjs`, preparado mas
nunca instalado por nenhum teste — este arquivo completa essa ligação.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
PORTA = int(os.environ.get("PORTA_ABORDAGEM", "8897"))
BASE = f"http://localhost:{PORTA}"
SENHA = "senha-de-teste"
falhas = []


def ok(cond, nome, extra=""):
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else f"  -> {extra}"))
    if not cond:
        falhas.append(nome)


def api(caminho, corpo, porta=PORTA, admin=False):
    req = urllib.request.Request(
        f"http://localhost:{porta}" + caminho, data=json.dumps(corpo).encode(),
        headers={"content-type": "application/json",
                 **({"x-admin-token": SENHA} if admin else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def montar_sandbox():
    """node_modules/@netlify/blobs e @anthropic-ai/sdk trocados pelos
    fakes, netlify/ copiado por cima — mesma receita do README, mais o
    pacote da Anthropic, que a receita documentada ainda não cobria."""
    sandbox = Path(tempfile.mkdtemp(prefix="abordagem-sandbox-"))

    blobs = sandbox / "node_modules" / "@netlify" / "blobs"
    blobs.mkdir(parents=True)
    shutil.copy(RAIZ / "netlify/testes/blobs_falso.mjs", blobs / "index.mjs")
    (blobs / "package.json").write_text(
        '{"name":"@netlify/blobs","type":"module","main":"index.mjs"}')

    anthropic = sandbox / "node_modules" / "@anthropic-ai" / "sdk"
    anthropic.mkdir(parents=True)
    shutil.copy(RAIZ / "netlify/testes/anthropic_falso.mjs", anthropic / "index.mjs")
    (anthropic / "package.json").write_text(
        '{"name":"@anthropic-ai/sdk","type":"module","main":"index.mjs"}')

    shutil.copytree(RAIZ / "netlify", sandbox / "netlify")
    shutil.copy(RAIZ / "netlify/testes/servidor_local.mjs", sandbox / "servidor.mjs")
    return sandbox


def subir_servidor(sandbox, porta, env_extra):
    servidor = subprocess.Popen(
        ["node", "servidor.mjs"], cwd=sandbox,
        stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
        env={**os.environ, "ADMIN_TOKEN": SENHA, "PORTA": str(porta), **env_extra})
    base = f"http://localhost:{porta}"
    for _ in range(40):
        try:
            urllib.request.urlopen(base + "/api/situacao", timeout=1)
            break
        except Exception:
            time.sleep(0.25)
    return servidor


def publicar(porta, vendedor):
    _, r = api("/api/publicar", {
        "vendedor": vendedor, "uf": "PA", "modo": "normal",
        "rotulo": "Distribuição de carteira",
        "colunas": ["Integrador (CLI - Nome)", "Cidade", "UF"],
        "linhas": [{"Integrador (CLI - Nome)": "CLI-0000000201 - SOLAR NORTE",
                    "Cidade": "BELÉM", "UF": "PA"}]},
        porta=porta, admin=True)
    return r["token"]


LEAD_OK = {"nome": "Integradora Teste", "cidade": "Belém", "estado": "PA",
           "observacoes": "Nunca conversamos, apareceu numa busca de integradores da região."}

sandbox = montar_sandbox()

try:
    print("1. IA desligada (IA_LIGADA ausente)")
    s1 = subir_servidor(sandbox, PORTA, {"ANTHROPIC_API_KEY": "sk-ant-teste"})
    try:
        tok = publicar(PORTA, "VENDEDOR ABORDAGEM DESLIGADA" + str(int(time.time())))

        st, s = api("/api/abordagem", {"token": tok, "acao": "saldo"})
        ok(s.get("ligado") is False, "saldo diz que está desligada", s)

        st, d = api("/api/abordagem", {"token": tok, "lead": LEAD_OK})
        ok(st == 503, "gerar é recusado com IA desligada", (st, d))
        ok("desligad" in json.dumps(d, ensure_ascii=False), "com o motivo certo", d)
    finally:
        s1.terminate()
        s1.wait(timeout=5)

    print("\n2. IA ligada — token inválido, lead vazio, caminho feliz")
    s2 = subir_servidor(sandbox, PORTA + 1, {
        "ANTHROPIC_API_KEY": "sk-ant-teste", "IA_LIGADA": "1"})
    try:
        st, d = api("/api/abordagem", {"token": "nao-existe", "lead": LEAD_OK}, porta=PORTA + 1)
        ok(st == 404, "token inválido responde 404", (st, d))

        tok = publicar(PORTA + 1, "VENDEDOR ABORDAGEM LIGADA" + str(int(time.time())))

        st, d = api("/api/abordagem", {"token": tok, "lead": {}}, porta=PORTA + 1)
        ok(st == 400, "lead totalmente vazio é recusado antes de chamar o modelo", (st, d))

        st, s = api("/api/abordagem", {"token": tok, "acao": "saldo"}, porta=PORTA + 1)
        ok(s.get("ligado") is True, "saldo diz que está ligada", s)
        antes = s.get("restantes")

        st, d = api("/api/abordagem", {"token": tok, "lead": LEAD_OK}, porta=PORTA + 1)
        ok(st == 200, "caminho feliz responde 200", (st, d))
        r = d.get("resposta", {})
        ok(r.get("tipoAbordagem") == "fria", "tipo_abordagem veio da resposta simulada", r)
        ok(bool(r.get("abertura")), "abertura não veio vazia", r)
        ok(len(r.get("possiveisRespostas") or []) >= 2,
           "ao menos 2 possíveis respostas", r.get("possiveisRespostas"))
        q = r.get("qualificacao", {})
        ok(set(["temperatura", "potencial", "intencao", "urgencia"]) <= set(q.keys()),
           "qualificação tem os 4 campos", q)
        a = r.get("proximaAcao", {})
        ok(set(["acao", "prazo", "objetivo", "mensagem"]) <= set(a.keys()),
           "próxima ação tem os 4 campos", a)
        ok(d.get("restantes") == antes - 1, "orçamento do vendedor decrementou 1", (antes, d.get("restantes")))
    finally:
        s2.terminate()
        s2.wait(timeout=5)

    print("\n3. orçamento do vendedor esgotado")
    s3 = subir_servidor(sandbox, PORTA + 2, {
        "ANTHROPIC_API_KEY": "sk-ant-teste", "IA_LIGADA": "1",
        "IA_ABORDAGEM_POR_VENDEDOR_DIA": "1"})
    try:
        tok = publicar(PORTA + 2, "VENDEDOR ABORDAGEM TETO" + str(int(time.time())))

        st, d1 = api("/api/abordagem", {"token": tok, "lead": LEAD_OK}, porta=PORTA + 2)
        ok(st == 200, "primeiro pedido do dia passa", (st, d1))
        ok(d1.get("restantes") == 0, "e zera o restante (teto=1)", d1)

        st, d2 = api("/api/abordagem", {"token": tok, "lead": LEAD_OK}, porta=PORTA + 2)
        ok(st == 429, "segundo pedido no mesmo dia é recusado", (st, d2))
        ok(d2.get("restantes") == 0, "restantes continua 0, não negativo", d2)
    finally:
        s3.terminate()
        s3.wait(timeout=5)

finally:
    shutil.rmtree(sandbox, ignore_errors=True)

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
sys.exit(1 if falhas else 0)
