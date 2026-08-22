"""Caixinha "ja falei", anotacoes privadas e o teto de gasto da IA.

Tres coisas precisam ser verdade, e sao as tres que este roteiro persegue:

  1. A marca de "ja falei" pertence a RODADA -- publicar uma lista nova
     comeca tudo zerado, sem apagar nada.
  2. A anotacao pertence ao VENDEDOR + CODIGO DO CLIENTE. O vendedor que
     receber o cliente depois nao ve nada; se o cliente voltar, tudo volta.
  3. O contador da IA vive no servidor e nao se fura -- nem por rajada
     simultanea, nem chamando a API direto, nem trocando de link.
"""
import json
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8899"
SENHA = "senha-de-teste"
SUF = "-" + str(int(time.time()))
falhas = []


def ok(cond, nome, extra=""):
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else f"  -> {extra}"))
    if not cond:
        falhas.append(nome)


def bruto(x):
    """Texto para procurar dentro. json.dumps escapa acento por padrao, e
    "Márcio" virava "M\\u00e1rcio" -- a busca falhava sem nada estar errado."""
    return json.dumps(x, ensure_ascii=False)


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


COLUNAS = ["Integrador (CLI - Nome)", "Cidade", "UF", "Telefone",
           "Categoria", "Última Nota", "Qtde. Pedidos", "Valor Faturado"]


def cli(cod, nome, cidade="BELÉM"):
    return {"Integrador (CLI - Nome)": f"CLI-{cod} - {nome}", "Cidade": cidade, "UF": "PA",
            "Telefone": "(91) 98888-0001", "Categoria": "Inativo",
            "Última Nota": "12/03/2026", "Qtde. Pedidos": 62, "Valor Faturado": 958627.01}


def publicar(vendedor, linhas, modo="normal"):
    return api("/api/publicar", {
        "vendedor": vendedor, "uf": "PA", "modo": modo,
        "rotulo": "Distribuição de carteira" if modo == "normal" else "Sem compras no mês",
        "colunas": COLUNAS, "linhas": linhas}, admin=True)


A = "ANA DO CADERNO" + SUF
B = "BENTO DO CADERNO" + SUF
CLIENTES = [cli("0000000101", "SOLAR NORTE"), cli("0000000102", "MARAJO ENERGIA"),
            cli("0000000103", "TAPAJOS SOLUCOES")]

print("1. publicando a mesma lista para dois vendedores")
_, ra = publicar(A, CLIENTES)
_, rb = publicar(B, CLIENTES)
tokA, tokB = ra["token"], rb["token"]
ok(tokA != tokB, "cada um com seu link")

print("\n2. a caixinha 'já falei'")
st, _ = api("/api/marcas", {"token": tokA, "modo": "normal",
                            "cliente": "CLI101", "marcado": True})
ok(st == 200, "marcou", st)
_, m = api("/api/marcas", {"token": tokA})
ok(m["marcas"]["normal"] == {"CLI101": True}, "a marca ficou guardada", m)
_, mb = api("/api/marcas", {"token": tokB})
ok(mb["marcas"].get("normal", {}) == {}, "o outro vendedor não vê a marca dela", mb)

api("/api/marcas", {"token": tokA, "modo": "normal", "cliente": "CLI101", "marcado": False})
_, m = api("/api/marcas", {"token": tokA})
ok(m["marcas"]["normal"] == {}, "desmarcar também funciona", m)

print("\n3. rodada nova zera as marcas, sem apagar nada à mão")
api("/api/marcas", {"token": tokA, "modo": "normal", "cliente": "CLI101", "marcado": True})
api("/api/marcas", {"token": tokA, "modo": "normal", "cliente": "CLI102", "marcado": True})
_, m = api("/api/marcas", {"token": tokA})
ok(len(m["marcas"]["normal"]) == 2, "duas marcadas antes da rodada nova")
time.sleep(1.1)          # publicadoEm precisa mudar
publicar(A, CLIENTES)    # rodada nova, mesma lista
_, m = api("/api/marcas", {"token": tokA})
ok(m["marcas"]["normal"] == {}, "rodada nova começa zerada", m["marcas"])

print("\n4. anotações: a regra central")
_, r = api("/api/anotacoes", {"token": tokA, "acao": "somar", "cliente": "CLI101",
                              "data": "18/08/2026", "texto": "Falei com o Márcio. Reclamou do frete."})
ok(len(r["notas"]) == 1, "gravou a primeira", r)
api("/api/anotacoes", {"token": tokA, "acao": "somar", "cliente": "CLI101",
                       "texto": "Sem retorno. Tentar terça."})
_, r = api("/api/anotacoes", {"token": tokA, "acao": "listar"})
ok(len(r["notas"]["CLI101"]) == 2, "duas anotações do mesmo cliente")

_, rb2 = api("/api/anotacoes", {"token": tokB, "acao": "listar"})
ok(rb2["notas"] == {}, "O VENDEDOR B NÃO VÊ NADA do A", rb2)
ok("Márcio" not in bruto(rb2), "nem um pedaço do texto vazou", bruto(rb2)[:120])

print("\n5. o cliente volta para o A: tudo intacto")
time.sleep(1.1)
publicar(A, CLIENTES)
_, r = api("/api/anotacoes", {"token": tokA, "acao": "listar"})
ok(len(r["notas"].get("CLI101", [])) == 2, "as duas anotações continuam lá", r)
ok("Márcio" in bruto(r["notas"]), "com o texto original", bruto(r["notas"])[:120])

print("\n6. editar e apagar")
_, r = api("/api/anotacoes", {"token": tokA, "acao": "editar", "cliente": "CLI101",
                              "indice": 0, "data": "19/08/2026", "texto": "Texto corrigido."})
ok(r["notas"][0]["texto"] == "Texto corrigido.", "editou", r["notas"][0])
ok(r["notas"][0]["data"] == "19/08/2026", "trocou a data também")
_, r = api("/api/anotacoes", {"token": tokA, "acao": "apagar", "cliente": "CLI101", "indice": 0})
ok(len(r["notas"]) == 1, "apagou uma", r)
st, _ = api("/api/anotacoes", {"token": tokA, "acao": "apagar", "cliente": "CLI101", "indice": 99})
ok(st == 404, "índice que não existe é recusado", st)

print("\n7. sem token válido, nada é lido nem escrito")
for caminho in ["/api/marcas", "/api/anotacoes"]:
    st, _ = api(caminho, {"token": "0" * 48, "acao": "listar"})
    ok(st == 404, f"{caminho}: token inexistente recusado", st)
    st, _ = api(caminho, {"token": "curto", "acao": "listar"})
    ok(st == 404, f"{caminho}: token malformado recusado", st)

print("\n8. IA: saldo e resposta")
_, s = api("/api/duvida", {"token": tokA, "acao": "saldo"})
print("     saldo:", s)
ok(s.get("ligado") is True, "a IA está ligada no teste", s)
LIMITE = s["limite"]
ok(s["restantes"] == LIMITE, "começa com o limite cheio", s)

_, d = api("/api/duvida", {"token": tokA, "pergunta": "o filho dele é engenheiro e faz o projeto"})
ok("resposta" in d, "respondeu", d)
ok(d["resposta"]["fala"].strip().endswith("?"), "a fala termina em pergunta", d["resposta"]["fala"])
ok(d["restantes"] == LIMITE - 1, "o contador desceu", d)

print("\n9. IA: pergunta que depende de dado real")
_, d = api("/api/duvida", {"token": tokA, "pergunta": "qual o prazo de entrega para Oiapoque?"})
t = bruto(d)
ok("não vou chutar" in t or "Não sei" in t or "não sei" in t,
   "a instrução manda recusar o dado que ela não tem", t[:180])

print("\n10. O TETO: rajada simultânea não fura o contador")
# O servidor de teste roda com o teto diario baixo (IA_POR_VENDEDOR_DIA) e o
# freio por minuto alto, para que a corrida exercitada aqui seja a do
# contador do DIA -- que e onde mora o risco de gastar sem contar.
_, s = api("/api/duvida", {"token": tokA, "acao": "saldo"})
restam = s["restantes"]
print(f"     restam {restam}; disparando {restam + 15} pedidos ao mesmo tempo")


def uma(i):
    time.sleep(0.001 * (i % 5))
    return api("/api/duvida", {"token": tokA, "pergunta": f"pergunta simultanea numero {i}"})[0]


with ThreadPoolExecutor(max_workers=20) as pool:
    codigos = list(pool.map(uma, range(restam + 15)))
aceitas = sum(1 for c in codigos if c == 200)
recusadas = sum(1 for c in codigos if c == 429)
print(f"     aceitas: {aceitas} · recusadas: {recusadas}")
ok(aceitas == restam, f"aceitou exatamente o que restava ({aceitas} de {restam})", codigos[:20])
ok(recusadas == 15, f"as 15 excedentes foram recusadas (foram {recusadas})")

_, s = api("/api/duvida", {"token": tokA, "acao": "saldo"})
ok(s["restantes"] == 0, "saldo zerado", s)
st, d = api("/api/duvida", {"token": tokA, "pergunta": "mais uma depois do limite"})
ok(st == 429, "a de número 21 é recusada", st)
ok("Acabaram" in d.get("erro", ""), "com recado claro", d)

print("\n11. o limite é do vendedor, não do aparelho nem do link")
_, sb = api("/api/duvida", {"token": tokB, "acao": "saldo"})
ok(sb["restantes"] == LIMITE, "o vendedor B tem a cota dele intacta", sb)

# Link novo para o MESMO vendedor: a conta continua onde parou.
_, novo = api("/api/publicar", {
    "vendedor": A, "uf": "PA", "modo": "normal", "rotulo": "Distribuição de carteira",
    "colunas": COLUNAS, "linhas": CLIENTES, "rotacionar": True}, admin=True)
ok(novo["token"] != tokA, "o link mudou", novo["token"][:12])
_, s2 = api("/api/duvida", {"token": novo["token"], "acao": "saldo"})
ok(s2["restantes"] == 0, "PEDIR LINK NOVO NÃO DEVOLVE PERGUNTAS", s2)
st, _ = api("/api/duvida", {"token": novo["token"], "pergunta": "tentando pelo link novo"})
ok(st == 429, "e perguntar pelo link novo continua recusado", st)

print("\n12. a tela do vendedor, de ponta a ponta")
_, rc = publicar("CARLA DA TELA" + SUF, CLIENTES)
tokC = rc["token"]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(f"{BASE}/c/#{tokC}")
    pg.wait_for_timeout(1800)

    ok(pg.evaluate("document.querySelectorAll('.falei-box').length") == 3,
       "uma caixinha por cliente",
       pg.evaluate("document.querySelectorAll('.falei-box').length"))
    ok("0 de 3 já contatados" in pg.inner_text(".rt-listas"), "contador na tela",
       pg.inner_text(".rt-listas")[:120])

    pg.check(".falei-box >> nth=0")
    pg.wait_for_timeout(900)
    ok("1 de 3 já contatados" in pg.inner_text(".rt-listas"), "marcar atualiza o contador")
    ok(pg.evaluate("document.querySelectorAll('tr[data-falei=\"1\"]').length") == 1,
       "a linha muda de estado")
    ok(pg.evaluate("document.querySelectorAll('tr[data-rtsel=\"1\"]').length") == 0,
       "marcar não seleciona a linha")

    # gravou no servidor mesmo?
    _, mc = api("/api/marcas", {"token": tokC})
    ok(len(mc["marcas"]["normal"]) == 1, "a marca chegou ao servidor", mc)

    pg.reload(); pg.wait_for_timeout(1800)
    ok(pg.evaluate("document.querySelectorAll('.falei-box:checked').length") == 1,
       "e sobrevive a recarregar a página")

    print("\n13. dois cliques abrem o caderno, e ele abre EM BRANCO")
    ok(pg.evaluate("document.getElementById('rtTabNotas').hidden"),
       "sem cliente escolhido, a aba nem aparece")

    pg.dblclick(".rt-listas tbody tr:nth-child(2) td:nth-child(2)")
    pg.wait_for_timeout(600)
    ok(not pg.evaluate("document.getElementById('rtTabNotas').hidden"),
       "o duplo clique faz a aba aparecer")
    ok(pg.evaluate("document.getElementById('rtTabNotas').getAttribute('aria-selected')") == "true",
       "e já abre nela")
    ok(pg.is_visible(".rt-notas"), "com a linha para escrever")

    # Em branco quer dizer em branco: nada de cabecalho de tabela, nada de
    # aviso, nada de texto explicando que esta vazio.
    ok(pg.evaluate("document.querySelectorAll('.rt-notas thead').length") == 0,
       "sem cabeçalho de tabela enquanto não há anotação")
    ok(pg.evaluate("document.querySelectorAll('.rt-privado').length") == 0,
       "sem o aviso de privacidade enquanto não há anotação")
    ok(pg.evaluate("document.querySelectorAll('.rt-notas tbody tr').length") == 1,
       "só a linha em branco",
       pg.evaluate("document.querySelectorAll('.rt-notas tbody tr').length"))
    ok("Nenhuma anotação" not in pg.inner_text("#rtNotas"),
       "sem texto avisando que está vazio", pg.inner_text("#rtNotas")[:140])

    pg.fill(".rt-notas tr[data-rtnova='1'] .rt-nota-txt", "Ligou de volta. Fecha em setembro.")
    pg.click("#rtNotas button.btn-primary")
    pg.wait_for_timeout(1200)
    ok(pg.evaluate("document.querySelectorAll('.rt-notas tbody tr').length") == 2,
       "1 anotação + a linha em branco nova",
       pg.evaluate("document.querySelectorAll('.rt-notas tbody tr').length"))
    ok(pg.evaluate("document.querySelectorAll('.rt-notas thead').length") == 1,
       "aí sim o cabeçalho aparece")
    ok("nem para o seu gestor" in pg.inner_text("#rtNotas"),
       "e o aviso de privacidade também", pg.inner_text("#rtNotas")[-140:])
    ok("1 anotação" in pg.inner_text(".rt-listas"), "a etiqueta apareceu na lista",
       pg.inner_text(".rt-listas")[:200])

    _, nc = api("/api/anotacoes", {"token": tokC, "acao": "listar"})
    ok("setembro" in bruto(nc), "chegou ao servidor", bruto(nc)[:120])

    print("\n14. o campo da IA na tela")
    pg.click("[data-rtaba='obj']")
    pg.wait_for_timeout(500)
    ok(pg.is_visible("#rtIa"), "o campo aparece quando a IA está ligada")
    ok("perguntas restantes hoje" in pg.inner_text("#rtIaConta"), "mostra o saldo",
       pg.inner_text("#rtIaConta"))
    pg.fill("#rtIaTxt", "ele disse que vai esperar a feira para decidir")
    pg.click("#rtIaPerguntar")
    pg.wait_for_timeout(2000)
    saida = pg.inner_text("#rtIaSaida")
    ok(len(saida) > 60, "veio resposta", saida[:100])
    ok("por trás disso" in saida.lower(), "no formato dos cenários", saida[:120])
    ok(pg.evaluate("document.getElementById('rtIaTxt').maxLength") == 600,
       "o campo tem teto de 600 caracteres")
    pg.screenshot(path="caderno-vendedor.png", full_page=True)

    ov = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
    ok(not ov, "sem rolagem lateral")

    m = b.new_context(viewport={"width": 390, "height": 844}).new_page()
    m.goto(f"{BASE}/c/#{tokC}")
    m.wait_for_timeout(1800)
    ok(not m.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"),
       "sem rolagem lateral no celular")
    m.screenshot(path="caderno-celular.png", full_page=True)

    print("\nerros de página:", errs or "nenhum")
    if errs:
        falhas.append("erros de console")
    b.close()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
raise SystemExit(1 if falhas else 0)
