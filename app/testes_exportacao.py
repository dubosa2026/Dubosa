"""Exportacao: Copiar, CSV e Baixar tudo, na tela do gestor.

Estes botoes chamavam toCSV, toTSV, safeName, download e buildZip -- cinco
funcoes que nunca existiram no projeto. Clicar em qualquer um deles lancava
"toCSV is not defined" e nao acontecia nada.

Confere que agora funcionam e, principalmente, que o valor exportado e o
mesmo da base: R$ 14.776.416,89 e nao 14776416886399996.
"""
import io
import os
import warnings
import zipfile
from playwright.sync_api import sync_playwright

warnings.filterwarnings("ignore")
S = "/tmp/claude-0/-home-user-Dubosa/2865c67b-73f7-5f69-865e-8196845b571f/scratchpad"
APP = "/home/user/Dubosa/app/dist/index.html"
BAIXADOS = S + "/baixados"
falhas = []


def ok(cond, nome, extra=""):
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else f"  -> {extra}"))
    if not cond:
        falhas.append(nome)


os.makedirs(BAIXADOS, exist_ok=True)
for f in os.listdir(BAIXADOS):
    os.remove(os.path.join(BAIXADOS, f))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1400, "height": 1000},
                        accept_downloads=True,
                        permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file://" + APP)
    pg.wait_for_timeout(700)

    print("1. as funcoes de exportacao existem")
    for nome in ["toCSV", "toTSV", "safeName", "download", "buildZip",
                 "paraNumero", "moeda", "inteiro", "valorExport"]:
        ok(pg.evaluate(f"typeof {nome}") == "function", f"{nome} definida",
           pg.evaluate(f"typeof {nome}"))

    print("\n2. leitura de numero, nos formatos que a base produz")
    casos = [
        (14776416.886399996, 14776416.886399996, "numero puro com dizima"),
        ("958627.0100000000", 958627.01, "texto com ponto decimal"),
        ("958.627,01", 958627.01, "texto brasileiro"),
        ("R$ 1.234,56", 1234.56, "ja formatado"),
        ("", None, "vazio"),
        ("abc", None, "texto sem numero"),
    ]
    for bruto, esperado, desc in casos:
        lido = pg.evaluate("v => { const n = paraNumero(v); return isNaN(n) ? null : n; }", bruto)
        bate = (lido is None and esperado is None) or (
            lido is not None and esperado is not None and abs(lido - esperado) < 0.005)
        ok(bate, f"paraNumero: {desc}", f"{bruto!r} -> {lido}, esperado {esperado}")

    print("\n3. escrita para arquivo: dinheiro com virgula, texto intocado")
    para = [
        ("Valor Faturado", 14776416.886399996, "14776416,89"),
        ("Valor Faturado", 958627.0099999998, "958627,01"),
        ("Qtde. Pedidos", 1040, "1040"),
        ("Cidade", "BELÉM", "BELÉM"),
        ("Telefone", "(91)99633-1047", "(91)99633-1047"),
        ("Última Nota", "28/07/2026", "28/07/2026"),
        ("Valor Faturado", None, ""),
    ]
    for col, bruto, esperado in para:
        saiu = pg.evaluate("a => valorExport(a[0], a[1])", [col, bruto])
        ok(saiu == esperado, f"valorExport {col} = {bruto!r}", f"saiu {saiu!r}, esperado {esperado!r}")

    print("\n4. carregando a base real")
    pg.click("#s1"); pg.wait_for_timeout(250)
    pg.set_input_files("#file", f"{S}/data_2.xlsx"); pg.wait_for_timeout(3200)
    pg.click("#toEquipe"); pg.wait_for_timeout(300)
    pg.click("#run"); pg.wait_for_timeout(3000)
    total = pg.evaluate("state.result.atribuidos.length")
    print("     distribuídos:", total)
    ok(total > 0, "a rodada produziu clientes")

    print("\n5. CSV de um vendedor")
    with pg.expect_download() as dl:
        pg.evaluate("""() => {
          const linha = [...document.querySelectorAll('#vendList .vrow')]
            .find(l => !l.querySelector('button').disabled);
          linha.querySelectorAll('button')[1].click();
        }""")
    arq = dl.value
    destino = os.path.join(BAIXADOS, arq.suggested_filename)
    arq.save_as(destino)
    conteudo = open(destino, encoding="utf-8-sig").read()
    linhas = conteudo.splitlines()
    print("     arquivo:", arq.suggested_filename)
    print("     cabeçalho:", linhas[0][:90])
    print("     1ª linha :", linhas[1][:90])
    ok(len(linhas) > 1, "o CSV tem linhas", len(linhas))
    ok(conteudo.startswith("﻿") or open(destino, "rb").read(3) == b"\xef\xbb\xbf",
       "tem BOM para o Excel abrir os acentos")
    ok(";" in linhas[0], "separado por ponto e vírgula")
    ok("Valor Faturado" in linhas[0], "traz a coluna de faturamento")

    # o valor exportado tem de bater com o da base, ao centavo
    # Nem todo cliente tem faturamento; procura um que tenha.
    conferencia = pg.evaluate("""() => {
      const v = state.result.resumo.find(x => x.qtde > 0);
      const col = state.result.colValor;
      const linha = v.linhas.find(l => paraNumero(l[col]) > 0);
      if (!linha) return null;
      return {bruto: linha[col], export: valorExport(col, linha[col]),
              cliente: linha[state.result.headers.find(h => /integrador/i.test(h))]};
    }""")
    print("     conferência:", conferencia)
    ok(conferencia is not None, "achou um cliente com faturamento para conferir")
    if conferencia:
        saiu = float(conferencia["export"].replace(",", "."))
        veio = float(conferencia["bruto"])
        print(f"     base {veio!r}  ->  arquivo {conferencia['export']!r}")
        ok(abs(saiu - veio) < 0.01, "o valor no CSV é o mesmo da base, ao centavo",
           f"{veio} virou {saiu}")
        ok(conferencia["export"] in conteudo, "esse valor está mesmo dentro do arquivo",
           conferencia["export"])

    print("\n6. Copiar (TSV) do mesmo vendedor")
    tsv = pg.evaluate("""() => {
      const v = state.result.resumo.find(x => x.qtde > 0);
      return toTSV(v.linhas.slice(0, 2), state.result.headers);
    }""")
    l = tsv.splitlines()
    print("     ", l[1][:100])
    ok(len(l) == 3, "cabeçalho + 2 linhas", len(l))
    ok("\t" in l[0], "separado por tabulação")
    ok("\n" not in l[1] and l[1].count("\t") == l[0].count("\t"),
       "todas as colunas alinhadas", (l[0].count("\t"), l[1].count("\t")))

    print("\n7. Baixar tudo (.zip)")
    with pg.expect_download() as dz:
        pg.click("#zipAll")
    z = dz.value
    zdest = os.path.join(BAIXADOS, z.suggested_filename)
    z.save_as(zdest)
    ok(zipfile.is_zipfile(zdest), "o arquivo é um zip válido de verdade")
    with zipfile.ZipFile(zdest) as zf:
        nomes = zf.namelist()
        ruim = zf.testzip()
        print("     ", len(nomes), "planilhas:", nomes[:4], "…")
        ok(ruim is None, "nenhuma entrada corrompida (CRC confere)", ruim)
        ok(any(n == "RESUMO.csv" for n in nomes), "traz o RESUMO.csv", nomes[:6])
        ok(any("/" in n for n in nomes), "as carteiras ficam em pasta por estado",
           [n for n in nomes if "/" in n][:3])
        ok(any(n.startswith("EXCLUIDOS") or n.startswith("NAO DISTRIBUIDO") for n in nomes),
           "quem ficou de fora também está no zip",
           [n for n in nomes if n.startswith(("EXCLUIDOS", "NAO"))])
        resumo = zf.read("RESUMO.csv").decode("utf-8-sig")
        print("     RESUMO 1ª linha:", resumo.splitlines()[1][:90])
        ok("Valor Faturado" in resumo.splitlines()[0], "RESUMO traz o faturamento")
        umaCarteira = [n for n in nomes if "/" in n][0]
        dentro = zf.read(umaCarteira).decode("utf-8-sig")
        ok(len(dentro.splitlines()) > 1, "a carteira dentro do zip tem clientes", umaCarteira)

    print("\n8. modo sem compras também exporta")
    pg.click("#s1"); pg.wait_for_timeout(250)
    pg.set_input_files("#file", f"{S}/data_2.xlsx"); pg.wait_for_timeout(3000)
    pg.click("#toEquipe"); pg.wait_for_timeout(300)
    pg.check("input[name='modo'][value='carteira']"); pg.wait_for_timeout(500)
    pg.click("#run"); pg.wait_for_timeout(3000)
    with pg.expect_download() as d2:
        pg.click("#zipAll")
    z2 = d2.value
    z2dest = os.path.join(BAIXADOS, "sem-compras-" + z2.suggested_filename)
    z2.save_as(z2dest)
    ok(zipfile.is_zipfile(z2dest), "zip da rodada sem-compras também é válido")
    with zipfile.ZipFile(z2dest) as zf:
        ok(zf.testzip() is None, "sem corrupção")
        print("     ", len(zf.namelist()), "planilhas")

    print("\nerros de página:", errs or "nenhum")
    if errs:
        falhas.append("erros de console")
    b.close()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
raise SystemExit(1 if falhas else 0)
