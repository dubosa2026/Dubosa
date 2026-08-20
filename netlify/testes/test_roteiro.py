"""Roteiro de ligacao na pagina do vendedor (layout 4).

Publica duas rodadas, abre o link do vendedor e confere que o roteiro fica
ao lado da lista, que clicar num cliente troca os dados da fala, e que
nenhum numero e inventado quando a base nao tem o dado.
"""
import json
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8899"
SENHA = "senha-de-teste"
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


COLUNAS = ["Integrador (CLI - Nome)", "Cidade", "UF", "Telefone",
           "Categoria", "Última Nota", "Qtde. Pedidos", "Valor Faturado"]


def cli(nome, cidade, ultima, pedidos, valor, cat="Inativo"):
    return {"Integrador (CLI - Nome)": nome, "Cidade": cidade, "UF": "PA",
            "Telefone": "(91) 98888-0001", "Categoria": cat,
            "Última Nota": ultima, "Qtde. Pedidos": pedidos,
            "Valor Faturado": valor}


VEND = "MARIA DO ROTEIRO" + SUF

print("1. publicando duas rodadas")
_, r1 = api("/api/publicar", {
    "vendedor": VEND, "uf": "PA", "modo": "normal",
    "rotulo": "Distribuição de carteira", "colunas": COLUNAS,
    "linhas": [
        cli("CLI-0000000101 - SOLAR NORTE ENGENHARIA LTDA", "BELÉM", "12/03/2026", 312, 4880200),
        # sem data e sem historico: o roteiro nao pode inventar numero
        cli("CLI-0000000102 - MARAJO ENERGIA LTDA", "BREVES", "", "", ""),
    ]}, admin=True)
tok = r1["token"]
_, r2 = api("/api/publicar", {
    "vendedor": VEND, "uf": "PA", "modo": "carteira",
    "rotulo": "Sem compras no mês", "colunas": COLUNAS,
    "linhas": [cli("CLI-0000000103 - TAPAJOS SOLUCOES", "SANTARÉM",
                   "28/07/2026", 184, 2410500, "Sem Compras")]}, admin=True)
ok(r2["rodadasNoLink"] == 2, "duas rodadas no link", r2)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
    errs = []
    # O clique num link tel: faz o Chromium headless tentar navegar para um
    # protocolo que ele nao trata e registrar erro no console. E ruido do
    # navegador de teste, nao da pagina -- so esse trecho e silenciado.
    surdo = [False]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console",
          lambda m: errs.append(m.text) if (m.type == "error" and not surdo[0]) else None)
    pg.goto(f"{BASE}/c/#{tok}")
    pg.wait_for_timeout(1800)

    print("\n2. o roteiro fica ao lado da lista")
    caixa = pg.evaluate("""() => {
      const l = document.querySelector('.rt-listas').getBoundingClientRect();
      const r = document.querySelector('.rt-lado').getBoundingClientRect();
      return {lx: Math.round(l.x), lw: Math.round(l.width),
              rx: Math.round(r.x), rw: Math.round(r.width)};
    }""")
    print("     ", caixa)
    ok(caixa["rx"] > caixa["lx"] + caixa["lw"] - 5, "roteiro à direita das listas", caixa)
    ok(caixa["lw"] > caixa["rw"], "a lista tem mais espaço que o roteiro", caixa)

    ok(pg.evaluate("""() => {
        const w = document.querySelector('.rt-listas .tablewrap');
        return getComputedStyle(w).maxHeight !== 'none';
    }"""), "a tabela tem altura própria com rolagem")

    print("\n3. sem cliente escolhido, nada é inventado")
    texto = pg.inner_text("#rtCards")
    ok("Clique num cliente" in pg.inner_text("#rtEscolhido"), "explica que é para clicar",
       pg.inner_text("#rtEscolhido")[:70])
    ok("a data da última compra" in texto, "a marca de data aparece como espaço em branco",
       texto[:160])
    n = pg.evaluate("document.querySelectorAll('#rtCards .rt-card').length")
    ok(n == 6, f"6 aberturas de prospecção (tem {n})")

    print("\n4. clicar num cliente preenche a fala")
    # A tela mostra a rodada mais recente primeiro, entao os indices nao
    # seguem a ordem de publicacao: localiza cada cliente pelo nome.
    #
    # Clica sempre na PRIMEIRA celula, nao no meio da linha. O centro da linha
    # cai na coluna Telefone, e no Chromium headless um clique em link tel:
    # deixa a pagina sem responder aos cliques seguintes -- limitacao do
    # navegador de teste, nao do app. O clique no telefone e exercitado no
    # passo 8, de proposito no fim do roteiro.
    def linhaDe(nome):
        return ".rt-listas tbody tr:has(td:text-matches('" + nome + "')) td:nth-child(1)"
    pg.click(linhaDe("SOLAR NORTE"))
    pg.wait_for_timeout(500)
    esc = pg.inner_text("#rtEscolhido")
    fala = pg.inner_text("#rtCards")
    print("     escolhido:", esc.replace("\n", " · ")[:110])
    ok("SOLAR NORTE" in esc, "cabeçalho mostra o cliente", esc[:80])
    ok("BELÉM" in esc, "mostra a cidade", esc[:80])
    ok("12/03/2026" in fala, "a fala usa a data da última compra", fala[:200])
    ok("312 pedidos" in fala, "a fala usa a quantidade de pedidos", fala[:220])
    ok("R$" in fala, "a fala usa o faturamento", fala[:220])
    ok("meses" in fala or "dias" in fala, "converte a data em tempo parado", fala[:200])
    ok(pg.evaluate("document.querySelectorAll('[data-rtsel=\"1\"]').length") == 1,
       "a linha escolhida fica destacada")

    print("\n5. cliente sem dado: espaço em branco, não número inventado")
    pg.click(linhaDe("MARAJO"))
    pg.wait_for_timeout(500)
    fala = pg.inner_text("#rtCards")
    ok("MARAJO" in pg.inner_text("#rtEscolhido"), "trocou de cliente")
    ok("a data da última compra" in fala, "sem data, volta a marca cinza", fala[:200])
    ok("12/03/2026" not in fala, "não vazou a data do cliente anterior", fala[:200])
    ok("312" not in fala, "não vazou o histórico do cliente anterior", fala[:200])

    print("\n6. o tipo de lista segue o cliente")
    pg.click(linhaDe("TAPAJOS"))
    pg.wait_for_timeout(500)
    ok(pg.evaluate("document.querySelector('[data-rttipo=\"carteira\"]').getAttribute('aria-pressed')") == "true",
       "clicar num cliente de sem-compras troca o conjunto de aberturas")
    ok("cadência" in pg.inner_text("#rtCards"), "mostra as aberturas de sem-compras",
       pg.inner_text("#rtCards")[:120])

    print("\n7. objeções e busca")
    pg.click("[data-rtaba='obj']")
    pg.wait_for_timeout(400)
    n = pg.evaluate("document.querySelectorAll('#rtObjs .rt-obj').length")
    ok(n == 17, f"17 objeções (tem {n})")
    ok(pg.evaluate("document.querySelectorAll('#rtObjs .rt-grupo').length") == 6, "6 grupos")
    ok(not pg.is_visible("#rtObjs .rt-obj:first-of-type .rt-obj-corpo"), "começa fechada")
    pg.click("#rtObjs .rt-obj .rt-obj-topo")
    pg.wait_for_timeout(300)
    ok(pg.is_visible("#rtObjs .rt-obj .rt-obj-corpo"), "abre ao clicar")

    pg.fill("#rtBusca", "mão de obra")
    pg.wait_for_timeout(400)
    vis = pg.evaluate("document.querySelectorAll('#rtObjs .rt-obj').length")
    ok(vis == 1, f"a busca filtrou para 1 (deu {vis})")
    ok(pg.is_visible("#rtObjs table"), "a conta ilustrada aparece")
    ok("R$ 1.500" in pg.inner_text("#rtObjs"), "o gap está na tela")
    pg.fill("#rtBusca", "zzz")
    pg.wait_for_timeout(400)
    ok(pg.is_visible("#rtSemResultado"), "avisa quando não acha")
    pg.fill("#rtBusca", "")
    pg.wait_for_timeout(400)

    print("\n8. clicar no telefone também prepara o roteiro")
    ok(pg.evaluate("""() => {
        const a = document.querySelector('.rt-listas tbody tr a[href^=tel]');
        return !!a;
    }"""), "o telefone continua sendo link de discagem")
    # A falha do protocolo tel: chega no console de forma assincrona, entao o
    # silencio vale ate o fim desta pagina. Dali para frente so ha leitura e
    # captura de tela -- nenhuma acao que pudesse gerar erro de verdade.
    surdo[0] = True
    pg.click(".rt-listas tbody tr:has(td:text-matches('SOLAR NORTE')) a[href^=tel]")
    pg.wait_for_timeout(600)
    ok("SOLAR NORTE" in pg.inner_text("#rtEscolhido"),
       "tocar no número já deixa o roteiro pronto para aquele cliente",
       pg.inner_text("#rtEscolhido")[:70])
    ok(pg.evaluate("document.querySelectorAll('[data-rtsel=\"1\"]').length") == 1,
       "uma linha selecionada por vez")

    ov = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
    ok(not ov, "sem rolagem lateral no desktop")
    pg.screenshot(path="roteiro-desktop.png", full_page=True)

    print("\n9. celular: empilha e o roteiro vai para cima")
    m = b.new_context(viewport={"width": 390, "height": 844}).new_page()
    m.goto(f"{BASE}/c/#{tok}")
    m.wait_for_timeout(1800)
    pos = m.evaluate("""() => {
      const l = document.querySelector('.rt-listas').getBoundingClientRect();
      const r = document.querySelector('.rt-lado').getBoundingClientRect();
      return {ly: Math.round(l.y + window.scrollY), ry: Math.round(r.y + window.scrollY)};
    }""")
    ok(pos["ry"] < pos["ly"], "no celular o roteiro vem antes da lista", pos)
    ovm = m.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
    ok(not ovm, "sem rolagem lateral no celular")
    m.click(".rt-listas tbody tr:has(td:text-matches('SOLAR NORTE')) td:nth-child(1)")
    m.wait_for_timeout(500)
    ok("SOLAR NORTE" in m.inner_text("#rtEscolhido"), "seleção funciona no celular")
    m.screenshot(path="roteiro-celular.png", full_page=True)

    print("\n10. a aba tem ícone próprio")
    ok(pg.evaluate("!!document.querySelector('link[rel=icon]')"),
       "a página declara favicon — sem isso o navegador pede /favicon.ico e leva 404")

    print("\n11. os valores dos cartões, nos formatos que a base produz")
    # A exportacao entrega numero como texto com ponto decimal e muitas casas
    # ("958627.0100000000"). Apagar todos os pontos transformava isso em
    # 9586270100000000 no cartao do roteiro. Cada caso abaixo ja apareceu.
    casos = [
        ("958627.0100000000", "R$ 958.627", "ponto decimal com muitas casas"),
        ("14776416.886399996", "R$ 14.776.417", "milhoes com dizimas (arredonda)"),
        ("958.627,01",         "R$ 958.627",    "formato brasileiro"),
        (4880200,              "R$ 4.880.200",  "numero puro"),
        ("R$ 1.234,56",        "R$ 1.235",      "ja formatado na origem"),
    ]
    VAL = "VALORES" + SUF
    _, rv = api("/api/publicar", {
        "vendedor": VAL, "uf": "PA", "modo": "normal",
        "rotulo": "Distribuição de carteira", "colunas": COLUNAS,
        "linhas": [
            dict(cli("CLI-020%d - TESTE %d" % (i, i), "BELÉM", "12/03/2026", 1040, bruto))
            for i, (bruto, _, _) in enumerate(casos)
        ] + [
            cli("CLI-0299 - SEM VALOR", "BELÉM", "12/03/2026", 1040, ""),
            cli("CLI-0298 - VALOR ZERO", "BELÉM", "12/03/2026", 1040, "0"),
        ]}, admin=True)

    pv = b.new_context(viewport={"width": 1500, "height": 1000}).new_page()
    everr = []
    pv.on("pageerror", lambda e: everr.append(str(e)))
    pv.goto(f"{BASE}/c/#{rv['token']}")
    pv.wait_for_timeout(1600)

    def cartaoDe(nome):
        pv.click(".rt-listas tbody tr:has(td:text-matches('" + nome + "')) td:nth-child(1)")
        pv.wait_for_timeout(350)
        return pv.inner_text("#rtEscolhido")

    for i, (bruto, esperado, descricao) in enumerate(casos):
        texto = cartaoDe("TESTE %d" % i)
        linha = [l for l in texto.split("\n") if "R$" in l]
        achado = linha[0].strip() if linha else "(sem valor)"
        print("     %-22s %-18s -> %s" % (descricao, str(bruto), achado))
        ok(achado.replace("\xa0", " ") == esperado, "valor certo: " + descricao,
           f"{bruto} virou {achado}, esperado {esperado}")

    ok("1.040" in cartaoDe("SEM VALOR"), "pedidos com separador de milhar",
       cartaoDe("SEM VALOR"))
    ok("R$" not in cartaoDe("SEM VALOR"), "sem faturamento, a linha some do cartão",
       cartaoDe("SEM VALOR"))
    ok("R$" not in cartaoDe("VALOR ZERO"), "faturamento zero também não vira linha",
       cartaoDe("VALOR ZERO"))

    # a tabela e o cartao precisam concordar
    naTabela = pv.evaluate("""() => {
      const tr = [...document.querySelectorAll('.rt-listas tbody tr')]
        .find(t => t.textContent.includes('TESTE 0'));
      return [...tr.children].map(td => td.textContent.trim()).find(t => t.startsWith('R$'));
    }""")
    ok(naTabela and naTabela.replace("\xa0", " ") == "R$ 958.627",
       "tabela e cartão mostram o mesmo valor", naTabela)
    ok(not everr, "sem erro de console na página de valores", everr)

    print("\n12. link vazio não quebra")
    v = b.new_context().new_page()
    v.goto(f"{BASE}/c/#" + "0" * 48)
    v.wait_for_timeout(1200)
    ok("Não consegui abrir" in v.inner_text("#conteudo") or "Link inválido" in v.inner_text("#conteudo"),
       "token inválido segue dando aviso", v.inner_text("#conteudo")[:80])

    print("\nerros de página:", errs or "nenhum")
    if errs:
        falhas.append("erros de console")
    b.close()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
raise SystemExit(1 if falhas else 0)
