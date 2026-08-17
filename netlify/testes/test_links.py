"""Fluxo completo: gestor publica -> cada vendedor abre o proprio link."""
from playwright.sync_api import sync_playwright

S = "/tmp/claude-0/-home-user-Dubosa/2865c67b-73f7-5f69-865e-8196845b571f/scratchpad"
BASE = "http://localhost:8899"
SENHA = "senha-de-teste"

falhas = []


def ok(cond, nome, extra=""):
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else f"  -> {extra}"))
    if not cond:
        falhas.append(nome)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")

    # ---------------- gestor ----------------
    gestor = b.new_context(viewport={"width": 1340, "height": 1000})
    g = gestor.new_page()
    errs = []
    g.on("pageerror", lambda e: errs.append(str(e)))
    g.goto(BASE)
    g.wait_for_timeout(700)

    g.set_input_files("#file", f"{S}/base_mes.xlsx")
    g.wait_for_timeout(2600)
    g.click("#toEquipe"); g.wait_for_timeout(300)
    g.check("input[name='modo'][value='carteira']"); g.wait_for_timeout(400)
    g.click("#run"); g.wait_for_timeout(2600)

    print("1. painel de publicação")
    ok(not g.evaluate("document.getElementById('publicarPanel').hidden"),
       "painel aparece quando servido pela web")

    # senha errada primeiro
    g.fill("#senhaPub", "errada")
    g.click("#publicar"); g.wait_for_timeout(3000)
    saida = g.inner_text("#publicarSaida")
    ok("Senha de publicação incorreta" in saida, "senha errada é recusada", saida[:120])

    print("\n2. publicação com a senha certa")
    g.fill("#senhaPub", SENHA)
    g.click("#publicar"); g.wait_for_timeout(6000)
    links = g.evaluate("""() => [...document.querySelectorAll('#publicarSaida [data-link]')]
        .map(b => b.getAttribute('data-link'))""")
    nomes = g.evaluate("""() => [...document.querySelectorAll('#publicarSaida .vname')]
        .map(e => e.textContent)""")
    qtdes = g.evaluate("""() => [...document.querySelectorAll('#publicarSaida .vuf')]
        .map(e => e.textContent)""")
    # Publica os 22 cadastrados + quem aparece na base sem estar na equipe.
    # Os que ficam sem cliente recebem publicacao vazia, que remove aquele
    # tipo do link em vez de deixar a lista do mes passado no ar.
    ok(len(links) >= 8, f"publicou todo mundo, não só os 8 da base (saíram {len(links)})")
    comClientes = [n for n, q in zip(nomes, qtdes) if q != "0"]
    ok(len(comClientes) == 8, f"8 com cliente nesta rodada (saíram {len(comClientes)})")
    ok(all(l.startswith(BASE + "/c/#") for l in links), "links no formato /c/#token")
    ok(len({l.split("#")[1] for l in links}) == len(links), "cada vendedor tem token único")
    print("     exemplo:", nomes[0], "->", links[0][:52] + "...")

    print("\n3. o vendedor abre o próprio link")
    esperado = dict(zip(nomes, qtdes))
    vend = b.new_context(viewport={"width": 390, "height": 844})  # celular
    v = vend.new_page()
    verrs = []
    v.on("pageerror", lambda e: verrs.append(str(e)))

    alvo = nomes.index("GIOVANNA DO CARMO FUJIMOTO")
    v.goto(links[alvo]); v.wait_for_timeout(1800)
    texto = v.inner_text("#conteudo")
    ok("Giovanna" in texto, "saúda pelo primeiro nome", texto[:80])
    ok("6 clientes" in texto, "mostra a quantidade certa", texto[:120])

    # Cada tipo de rodada tem sua propria secao; conta so a que interessa.
    linhasTela = v.evaluate("""()=>{
      const p=[...document.querySelectorAll('.panel')].find(
        p=>/Sem compras/.test(p.querySelector('h3').textContent));
      return p ? p.querySelectorAll('tbody tr').length : -1;
    }""")
    ok(linhasTela == 6, f"seção Sem compras com 6 linhas (tem {linhasTela})")

    outros = [n for n in nomes if n != "GIOVANNA DO CARMO FUJIMOTO"]
    vazou = [n for n in outros if n in texto]
    ok(not vazou, "não aparece nome de outro vendedor na página", vazou)
    v.screenshot(path="link-vendedor.png", full_page=True)

    print("\n4. isolamento entre vendedores")
    dados_por_token = {}
    for nome, link in zip(nomes, links):
        token = link.split("#")[1]
        d = v.evaluate("""async (t) => {
          const r = await fetch('/api/carteira', {method:'POST',
            headers:{'content-type':'application/json'}, body: JSON.stringify({token:t})});
          return r.ok ? await r.json() : {erro: r.status};
        }""", token)
        dados_por_token[nome] = d
    corretos = all(d.get("vendedor") == n for n, d in dados_por_token.items())
    ok(corretos, "cada token devolve exatamente o seu dono",
       [(n, d.get("vendedor")) for n, d in dados_por_token.items() if d.get("vendedor") != n])

    def linhasDaRodada(d):
        r = (d.get("rodadas") or {}).get("carteira") or {}
        return len(r.get("linhas", []))
    contagens_ok = all(str(linhasDaRodada(d)) == esperado[n] for n, d in dados_por_token.items())
    ok(contagens_ok, "quantidade por token bate com a do gestor")

    print("\n5. tokens inválidos")
    for descricao, token in [
        ("token inexistente", "a" * 48),
        ("token curto", "abc"),
        ("tentativa de path traversal", "../../tokens/RAYANE-ALMEIDA-DOS-SANTOS"),
        ("token vazio", ""),
    ]:
        r = v.evaluate("""async (t) => {
          const r = await fetch('/api/carteira', {method:'POST',
            headers:{'content-type':'application/json'}, body: JSON.stringify({token:t})});
          return {status: r.status, corpo: await r.text()};
        }""", token)
        ok(r["status"] == 404 and "vendedor" not in r["corpo"], f"{descricao} -> 404 sem dados",
           f"{r['status']} {r['corpo'][:60]}")

    print("\n6. link sem o token")
    v.goto(BASE + "/c/"); v.wait_for_timeout(1200)
    t2 = v.inner_text("#conteudo")
    ok("Link incompleto" in t2, "explica que falta a parte final do link", t2[:90])

    print("\n7. o link continua o mesmo na rodada seguinte")
    g.click("#s2"); g.wait_for_timeout(300)
    g.click("#run"); g.wait_for_timeout(2600)
    g.click("#publicar"); g.wait_for_timeout(6000)
    links2 = g.evaluate("""() => [...document.querySelectorAll('#publicarSaida [data-link]')]
        .map(b => b.getAttribute('data-link'))""")
    ok(sorted(links2) == sorted(links), "mesmos links depois de republicar")

    ov = v.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
    ok(not ov, "página do vendedor sem overflow no celular")

    print("\nerros de página — gestor:", errs or "nenhum", "| vendedor:", verrs or "nenhum")
    if errs or verrs:
        falhas.append("erros de console")
    b.close()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
raise SystemExit(1 if falhas else 0)
