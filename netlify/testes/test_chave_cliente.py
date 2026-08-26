"""A anotação de um cliente não pode aparecer nos outros.

Reproduz o defeito relatado em produção. A versão anterior de chaveCliente
pegava a PRIMEIRA coluna cujo NOME contém "integrador" e nunca olhava o
valor. A base tinha outra coluna assim ANTES da certa -- uma contagem,
valendo 1 em toda linha -- então a chave virou "1" para os 130 clientes: a
marca de "já falei" e a anotação de um passaram a valer para todos.

O roteiro monta essa base de propósito e cobra:

  1. cada cliente tem chave própria, mesmo com a coluna armadilha na frente;
  2. a anotação escrita num cliente NÃO aparece em nenhum outro;
  3. linha que não dá para identificar não ganha caixinha nem anotação --
     compartilhar seria pior do que não ter.
"""
import json
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8899"
SENHA = "senha-de-teste"
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


SUF = "-chave-" + str(int(time.time()))
V = "NILTON CHAVE" + SUF

# "Integradores" vem ANTES de "Integrador (CLI - Nome)" e vale 1 em toda
# linha. É a armadilha exata da base de produção.
COLUNAS = ["|", "UF", "Integradores", "Cidade", "Integrador (CLI - Nome)",
           "Telefone", "CNPJ", "Categoria"]

CLIENTES = [
    ("CLI-0000117589 - DIEGO DE LACERDA BASILIO EIRELI", "11222333000181"),
    ("CLI-0000128900 - ELVIS PEREIRA DE CARVALHO SILVA", "11222333000182"),
    ("CLI-0000247363 - 46036872 LUCIVAL DO ROSARIO LOBATO", "11222333000183"),
    ("CLI-0000289736 - 52.679.407 NEIVALDO FERREIRA NUNES", "11222333000184"),
]
linhas = [{"|": "", "UF": "PA", "Integradores": 1, "Cidade": "BELÉM",
           "Integrador (CLI - Nome)": nome, "Telefone": "(91) 98888-000" + str(i),
           "CNPJ": doc, "Categoria": "Sem Compras este Mês"}
          for i, (nome, doc) in enumerate(CLIENTES)]

# Uma linha sem nada que identifique: nem código, nem nome, nem documento.
linhas.append({"|": "", "UF": "PA", "Integradores": 1, "Cidade": "BELÉM",
               "Integrador (CLI - Nome)": "", "Telefone": "(91) 98888-0099",
               "CNPJ": "", "Categoria": "Sem Compras este Mês"})

st, r = api("/api/publicar", {
    "vendedor": V, "uf": "PA", "modo": "carteira",
    "rotulo": "Sem compras no mês", "colunas": COLUNAS, "linhas": linhas}, admin=True)
tok = r["token"]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/c/#{tok}")
    pg.wait_for_timeout(1800)

    print("1. cada cliente com a sua chave")
    chaves = pg.evaluate("""[...document.querySelectorAll('.rt-listas tbody tr[data-rodada]')]
        .map(tr => { const c = tr.querySelector('.falei-box');
                     return c ? c.getAttribute('data-cliente') : null; })""")
    print("     ", chaves)
    comChave = [k for k in chaves if k]
    ok(len(set(comChave)) == 4, "as 4 linhas boas têm chaves distintas", chaves)
    ok("1" not in comChave, "e nenhuma delas é a contagem da coluna armadilha", chaves)
    ok(all(k.startswith("CLI") for k in comChave),
       "todas vieram do código CLI", chaves)

    print("\n2. linha sem identificação não compartilha nada")
    ok(chaves[4] is None, "não ganha caixinha de 'já falei'", chaves[4])
    ok(pg.evaluate("document.querySelectorAll('tr[data-semchave] .sem-chave').length") == 1,
       "e fica marcada como não identificada")

    print("\n3. a anotação fica SÓ no cliente dela")
    pg.dblclick(".rt-listas tbody tr:nth-child(2) td:nth-child(2)")
    pg.wait_for_timeout(700)
    pg.fill(".rt-notas tr[data-rtnova='1'] .rt-nota-txt", "SO DO SEGUNDO")
    pg.click("#rtNotas button.btn-primary")
    pg.wait_for_timeout(1300)

    vistas = []
    for i in range(1, 5):
        pg.dblclick(f".rt-listas tbody tr:nth-child({i}) td:nth-child(2)")
        pg.wait_for_timeout(450)
        # textarea não entra em innerText: é preciso ler os valores.
        vals = pg.evaluate("""[...document.querySelectorAll('#rtNotas .rt-nota-txt')]
                              .map(t => t.value).filter(Boolean)""")
        vistas.append(vals)
    print("     ", vistas)
    ok(vistas[1] == ["SO DO SEGUNDO"], "o segundo cliente tem a anotação", vistas[1])
    ok(all(v == [] for i, v in enumerate(vistas) if i != 1),
       "e NENHUM outro cliente a vê", vistas)
    ok(pg.evaluate("document.querySelectorAll('.tag-nota').length") == 1,
       "uma etiqueta só na lista inteira",
       pg.evaluate("document.querySelectorAll('.tag-nota').length"))

    print("\n4. a evidência de quem é a anotação")
    pg.dblclick(".rt-listas tbody tr:nth-child(2) td:nth-child(2)")
    pg.wait_for_timeout(500)
    dono = pg.inner_text(".rt-nota-dono")
    ok("CLI128900" in dono, "o código do cliente aparece por cima", dono)
    ok("ELVIS" in dono.upper(), "com o nome dele junto", dono)

    print("\n5. a marca de 'já falei' também é de um só")
    pg.check(".falei-box >> nth=0")
    pg.wait_for_timeout(900)
    ok(pg.evaluate("document.querySelectorAll('.falei-box:checked').length") == 1,
       "marcar um não marca os outros",
       pg.evaluate("document.querySelectorAll('.falei-box:checked').length"))
    _, mc = api("/api/marcas", {"token": tok})
    ok(len(mc["marcas"]["carteira"]) == 1, "e o servidor guardou uma marca só", mc)

    print("\nerros de página:", errs or "nenhum")
    if errs:
        falhas.append("erros de console")
    b.close()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
raise SystemExit(1 if falhas else 0)
