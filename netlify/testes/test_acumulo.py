"""O link do vendedor acumula uma rodada por tipo.

Publicar Distribuicao e depois Sem-compras tem de deixar as DUAS no ar;
publicar outra Distribuicao troca so a Distribuicao.
"""
import json
import urllib.request
from playwright.sync_api import sync_playwright

S = "/tmp/claude-0/-home-user-Dubosa/2865c67b-73f7-5f69-865e-8196845b571f/scratchpad"
BASE = "http://localhost:8899"
SENHA = "senha-de-teste"
import time
# O deposito do servidor de teste vive em memoria e sobrevive entre execucoes.
# Nomes unicos por rodada garantem que cada execucao comece do zero.
SUF = "-" + str(int(time.time()))
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


def publicar(vendedor, modo, rotulo, linhas, colunas=None):
    return api("/api/publicar", {
        "vendedor": vendedor, "modo": modo, "rotulo": rotulo,
        "colunas": colunas or ["Integrador (CLI - Nome)", "Telefone"],
        "linhas": linhas}, admin=True)


def ler(token):
    return api("/api/carteira", {"token": token})


print("1. acúmulo por tipo, direto na API")
_, r1 = publicar("TESTE ACUMULO" + SUF, "normal", "Distribuição de carteira", [
    {"Integrador (CLI - Nome)": "CLI-0000000001 - ALFA LTDA", "Telefone": "91999990001"},
    {"Integrador (CLI - Nome)": "CLI-0000000002 - BETA LTDA", "Telefone": "91999990002"},
])
tok = r1["token"]
ok(r1["rodadasNoLink"] == 1, "1 rodada após publicar Distribuição", r1)

_, r2 = publicar("TESTE ACUMULO" + SUF, "carteira", "Sem compras no mês", [
    {"Integrador (CLI - Nome)": "CLI-0000000002 - BETA LTDA", "Telefone": "91999990002"},
    {"Integrador (CLI - Nome)": "CLI-0000000003 - GAMA LTDA", "Telefone": "91999990003"},
])
ok(r2["rodadasNoLink"] == 2, "2 rodadas após publicar Sem compras", r2)
ok(r2["token"] == tok, "o link do vendedor não mudou")

_, doc = ler(tok)
ok(sorted(doc["rodadas"].keys()) == ["carteira", "normal"], "as duas convivem no link",
   list(doc["rodadas"].keys()))
ok(len(doc["rodadas"]["normal"]["linhas"]) == 2, "Distribuição intacta com 2 clientes")
ok(len(doc["rodadas"]["carteira"]["linhas"]) == 2, "Sem compras com 2 clientes")

print("\n2. publicar de novo troca só o mesmo tipo")
publicar("TESTE ACUMULO" + SUF, "normal", "Distribuição de carteira", [
    {"Integrador (CLI - Nome)": "CLI-0000000009 - NOVA LTDA", "Telefone": "91999990009"},
])
_, doc = ler(tok)
ok(len(doc["rodadas"]["normal"]["linhas"]) == 1, "Distribuição substituída",
   len(doc["rodadas"]["normal"]["linhas"]))
ok("NOVA" in doc["rodadas"]["normal"]["linhas"][0]["Integrador (CLI - Nome)"],
   "Distribuição tem o conteúdo novo")
ok(len(doc["rodadas"]["carteira"]["linhas"]) == 2, "Sem compras NÃO foi tocada",
   len(doc["rodadas"]["carteira"]["linhas"]))

print("\n3. rodada vazia remove aquele tipo, sem afetar os outros")
_, r3 = publicar("TESTE ACUMULO" + SUF, "normal", "Distribuição de carteira", [])
_, doc = ler(tok)
ok("normal" not in doc["rodadas"], "Distribuição removida quando vem vazia",
   list(doc["rodadas"].keys()))
ok("carteira" in doc["rodadas"], "Sem compras sobreviveu")
ok(r3["rodadasNoLink"] == 1, "contagem devolvida bate", r3)

print("\n4. tipo desconhecido não cria chave solta")
api("/api/publicar", {"vendedor": "TESTE ACUMULO" + SUF, "modo": "hackeado",
                      "colunas": ["A"], "linhas": [{"A": 1}]}, admin=True)
_, doc = ler(tok)
ok(set(doc["rodadas"].keys()) <= {"normal", "ataque", "carteira"},
   "só os três tipos previstos existem", list(doc["rodadas"].keys()))

print("\n5. na tela do vendedor")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")

    # cenario com cliente repetido entre as duas rodadas
    _, rr = publicar("MARIA TELA" + SUF, "normal", "Distribuição de carteira", [
        {"Integrador (CLI - Nome)": "CLI-0000000001 - ALFA LTDA", "Telefone": "(91) 99999-0001"},
        {"Integrador (CLI - Nome)": "CLI-0000000002 - BETA LTDA", "Telefone": "(91) 99999-0002"},
    ])
    publicar("MARIA TELA" + SUF, "carteira", "Sem compras no mês", [
        {"Integrador (CLI - Nome)": "CLI-0000000002 - BETA LTDA", "Telefone": "(91) 99999-0002"},
        {"Integrador (CLI - Nome)": "CLI-0000000003 - GAMA LTDA", "Telefone": "(91) 99999-0003"},
    ])
    link = f"{BASE}/c/#{rr['token']}"

    pg = b.new_context(viewport={"width": 1340, "height": 1000}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(link)
    pg.wait_for_timeout(1800)

    titulos = pg.evaluate("()=>[...document.querySelectorAll('.panel-head h3')].map(h=>h.textContent.trim())")
    print("     seções:", titulos)
    ok(len(titulos) == 2, "duas seções na página", titulos)
    ok(any("Sem compras" in t for t in titulos), "seção Sem compras presente")
    ok(any("Distribuição" in t for t in titulos), "seção Distribuição presente")

    texto = pg.inner_text("#conteudo")
    ok("4 clientes" in texto, "soma os clientes das duas listas", texto[:130])

    tags = pg.evaluate("()=>[...document.querySelectorAll('.tag-rep')].map(t=>t.textContent)")
    print("     etiquetas de repetido:", tags)
    ok(len(tags) == 2, "BETA marcado nas duas listas", tags)
    ok("1 cliente aparece em mais de uma lista" in texto, "avisa no topo", texto[:200])

    ok(pg.evaluate("document.querySelectorAll('[data-baixar]').length") == 2,
       "cada lista tem seu botão de baixar")

    # a mais recente aparece primeiro
    ok("Sem compras" in titulos[0], "lista mais recente no topo", titulos)

    ov = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    ok(ov <= 1, "sem overflow", ov)
    pg.screenshot(path="acumulo-vendedor.png", full_page=True)

    # celular
    m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
    m.goto(link); m.wait_for_timeout(1600)
    ovm = m.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    ok(ovm <= 1, "sem overflow no celular", ovm)
    m.screenshot(path="acumulo-celular.png", full_page=True)

    print("     erros de página:", errs or "nenhum")
    if errs:
        falhas.append("erros de console")
    b.close()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
raise SystemExit(1 if falhas else 0)
