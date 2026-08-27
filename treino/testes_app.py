"""O app inteiro num navegador de celular.

    python3 treino/testes_app.py

Sobe o Chromium num viewport de telefone, abre `treino/dist/index.html` e
usa o app como a pessoa usaria: escolhe o tempo, confere o circuito, treina
do aquecimento ao alongamento, pula uma estacao, pausa, encerra.

O treino inteiro leva vinte minutos de relogio de parede, e nenhum teste
pode levar vinte minutos. Por isso aqui entra o relogio falso do Playwright:
o app le a hora do sistema (`Date.now`) de proposito — e o que faz ele
voltar no passo certo quando o celular dorme —, entao adiantar o relogio do
navegador adianta o treino, exatamente como aconteceria de verdade.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent / "dist" / "index.html"


def abrir_navegador(p):
    """O Chromium do Playwright, onde ele estiver.

    Na maquina de quem desenvolve, `playwright install` deixa o navegador no
    lugar padrao e o launch direto funciona. Em maquina de CI o navegador ja
    vem instalado numa pasta propria, e as vezes numa versao diferente da
    que o pacote Python espera — ai o launch padrao falha reclamando de um
    caminho que nao existe. Procurar o binario evita pedir download de
    navegador so para rodar o teste.
    """
    try:
        return p.chromium.launch()
    except Exception:
        for caminho in sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux/chrome")):
            return p.chromium.launch(executable_path=str(caminho))
        raise


falhas = []
feitas = []


def ok(cond, nome, extra=""):
    feitas.append(nome)
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else "  -> " + str(extra)))
    if not cond:
        falhas.append(nome)


def estado(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('circuito.v1') || 'null')")


def texto(pg, selecao):
    el = pg.query_selector(selecao)
    return el.inner_text().strip() if el else ""


with sync_playwright() as p:
    navegador = abrir_navegador(p)
    ctx = navegador.new_context(viewport={"width": 390, "height": 844},
                                device_scale_factor=2, locale="pt-BR")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.clock.install()
    pg.goto(APP.as_uri())
    pg.wait_for_selector(".hero .valor")

    print("\nA tela de Hoje")
    ok(not erros, "abre sem erro de javascript", erros)
    ok("min" in texto(pg, ".hero .valor"), "mostra a duração do treino", texto(pg, ".hero .valor"))
    ok(pg.query_selector_all(".estacao") != [], "lista as estações do circuito")

    minutos_antes = texto(pg, ".hero .valor")
    pg.click('[data-tempo="45"]')
    pg.wait_for_timeout(60)
    ok(texto(pg, ".hero .valor") != minutos_antes, "trocar o tempo remonta o treino",
       texto(pg, ".hero .valor"))
    ok(abs(int(texto(pg, ".hero .valor").split()[0]) - 45) <= 4,
       "45 minutos pedidos viram ~45 minutos montados", texto(pg, ".hero .valor"))

    pg.click('[data-tempo="20"]')
    pg.wait_for_timeout(60)
    antes = pg.eval_on_selector_all(".estacao .n2", "els => els.map(e => e.innerText)")
    pg.click('[data-acao="sortear"]')
    pg.wait_for_timeout(80)
    depois = pg.eval_on_selector_all(".estacao .n2", "els => els.map(e => e.innerText)")
    ok(antes != depois, "sortear outro circuito troca os exercícios")

    # O mesmo dia, os mesmos ajustes: recarregar nao pode inventar outro
    # treino, senao a pessoa perde o circuito que ja tinha lido.
    guardado = pg.eval_on_selector_all(".estacao .n2", "els => els.map(e => e.innerText)")
    pg.reload()
    pg.wait_for_selector(".hero .valor")
    ok(pg.eval_on_selector_all(".estacao .n2", "els => els.map(e => e.innerText)") == guardado,
       "recarregar mantém o treino do dia")

    print("\nEquipamento e impacto")
    pg.click('[data-pane="ajustes"]')
    pg.wait_for_selector('input[data-equip="halter"]')
    pg.check('input[data-equip="halter"]')
    pg.wait_for_timeout(60)
    pg.click('[data-pane="hoje"]')
    pg.wait_for_selector(".hero .valor")
    tudo = pg.inner_text("#pane-hoje")
    ok("Halteres" in tudo, "ligar halteres muda o que o treino pede", tudo[:120])

    pg.click('[data-pane="ajustes"]')
    pg.check('input[data-ligar="semImpacto"]')
    pg.wait_for_timeout(60)
    pg.click('[data-pane="hoje"]')
    pg.wait_for_selector(".hero .valor")
    nomes = pg.eval_on_selector_all(".estacao .n2", "els => els.map(e => e.innerText)")
    barulhentos = [n for n in nomes if "Polichinelo" in n or "Burpee" in n and "sem salto" not in n
                   or "salto" in n and "sem salto" not in n]
    ok(not barulhentos, "sem pulo tira mesmo os exercícios de impacto", barulhentos)

    pg.click('[data-pane="ajustes"]')
    pg.uncheck('input[data-ligar="semImpacto"]')
    pg.wait_for_timeout(60)

    print("\nO catálogo")
    pg.click('[data-pane="exercicios"]')
    pg.wait_for_selector("#buscaEx")
    total = len(pg.query_selector_all("#pane-exercicios .item"))
    ok(total > 50, "o catálogo aparece inteiro", total)
    pg.fill("#buscaEx", "prancha")
    pg.wait_for_timeout(80)
    achados = pg.eval_on_selector_all("#pane-exercicios .item b", "els => els.map(e => e.innerText)")
    ok(achados and all("rancha" in a for a in achados), "a busca filtra", achados)
    pg.fill("#buscaEx", "flexao")
    pg.wait_for_timeout(80)
    ok(pg.eval_on_selector_all("#pane-exercicios .item b", "els => els.map(e=>e.innerText)"),
       "a busca acha 'flexao' sem acento")
    pg.click("#pane-exercicios .item")
    pg.wait_for_selector("#folha:not([hidden])")
    ok(len(pg.query_selector_all("#folhaDentro li")) >= 2, "a ficha mostra as dicas")
    pg.click('#folhaDentro [data-acao="fechar"]')

    print("\nO treino, do começo ao fim")
    pg.click('[data-pane="hoje"]')
    pg.wait_for_selector(".hero .valor")
    previsto = int(texto(pg, ".hero .valor").split()[0])
    pg.click("#btnComecar")
    pg.wait_for_selector("#exec:not([hidden])")
    ok(pg.get_attribute("#exec", "data-fase") == "preparar", "começa preparando",
       pg.get_attribute("#exec", "data-fase"))
    ok(texto(pg, "#execCron") == "00:10", "a preparação são 10 segundos", texto(pg, "#execCron"))

    pg.clock.fast_forward("00:06")
    pg.wait_for_timeout(50)
    ok(texto(pg, "#execCron") == "00:04", "o cronômetro anda", texto(pg, "#execCron"))

    pg.clock.fast_forward("00:06")
    pg.wait_for_timeout(50)
    ok(pg.get_attribute("#exec", "data-fase") == "aquecimento", "depois de preparar vem o aquecimento",
       pg.get_attribute("#exec", "data-fase"))

    nome_antes = texto(pg, "#execNome")
    pg.click("#execPular")
    pg.wait_for_timeout(50)
    ok(texto(pg, "#execNome") != nome_antes, "pular troca de exercício")
    pg.click("#execVoltar")
    pg.wait_for_timeout(50)
    ok(texto(pg, "#execNome") == nome_antes, "voltar desfaz o pulo")

    pg.click("#execPausa")
    pg.wait_for_timeout(30)
    parado = texto(pg, "#execCron")
    pg.clock.fast_forward("00:20")
    pg.wait_for_timeout(50)
    ok(texto(pg, "#execCron") == parado, "pausado, o cronômetro não anda", texto(pg, "#execCron"))
    ok("Pausado" in texto(pg, "#execNota"), "a tela diz que está pausado")
    pg.click("#execPausa")
    pg.wait_for_timeout(50)
    pg.clock.fast_forward("00:05")
    pg.wait_for_timeout(50)
    ok(texto(pg, "#execCron") != parado, "voltar da pausa faz o cronômetro andar de novo")

    # Chega ao fim: adianta bem mais que o treino inteiro.
    pg.clock.fast_forward("40:00")
    pg.wait_for_timeout(200)
    ok(pg.query_selector("#exec").is_hidden(), "no fim, a tela de treino sai")
    ok("min" in pg.inner_text(".medalha"), "aparece a medalha do fim", pg.inner_text(".medalha")[:60])

    e = estado(pg)
    ok(len(e["historico"]) == 1, "o treino entrou no histórico", e["historico"])
    sessao = e["historico"][0]
    ok(sessao["completo"] is True, "marcado como completo")
    ok(abs(sessao["minutos"] - previsto) <= 3,
       "os minutos guardados batem com os prometidos", (sessao["minutos"], previsto))
    ok(len(sessao["exercicios"]) >= 4, "guardou quais exercícios foram feitos", sessao["exercicios"])

    pg.click('#folhaDentro [data-acao="fechar"]')
    ok("1 dia" in texto(pg, "#chipSequencia"), "a sequência começou", texto(pg, "#chipSequencia"))

    print("\nO histórico")
    pg.click('[data-pane="historico"]')
    pg.wait_for_selector(".barras")
    ok(len(pg.query_selector_all(".barras i")) == 14, "o gráfico tem 14 dias")
    ok(len(pg.query_selector_all(".barras i.tem")) == 1, "só o dia de hoje está preenchido")
    ok("1" in pg.inner_text("#pane-historico .mini"), "a sequência aparece no cartão")

    pg.click("[data-apagar]")
    pg.wait_for_timeout(80)
    ok(estado(pg)["historico"] == [], "apagar uma sessão funciona")
    pg.click(".toast button")
    pg.wait_for_timeout(80)
    ok(len(estado(pg)["historico"]) == 1, "desfazer devolve a sessão")

    print("\nParar no meio")
    pg.click('[data-pane="hoje"]')
    pg.wait_for_selector("#btnComecar")
    pg.click("#btnComecar")
    pg.wait_for_selector("#exec:not([hidden])")
    pg.clock.fast_forward("00:30")
    pg.wait_for_timeout(60)
    pg.click("#execFechar")
    pg.wait_for_timeout(150)
    e = estado(pg)
    ok(len(e["historico"]) == 1,
       "parar antes da primeira estação não registra nada", len(e["historico"]))

    pg.click("#btnComecar")
    pg.wait_for_selector("#exec:not([hidden])")
    pg.clock.fast_forward("06:00")
    pg.wait_for_timeout(80)
    pg.click("#execFechar")
    pg.wait_for_timeout(150)
    e = estado(pg)
    ok(len(e["historico"]) == 2, "parar depois de treinar registra", len(e["historico"]))
    ok(e["historico"][0]["completo"] is False, "e fica marcado como incompleto")

    print("\nAjustes")
    pg.click('[data-pane="ajustes"]')
    pg.wait_for_selector('[data-nivel="3"]')
    pg.click('[data-nivel="3"]')
    pg.wait_for_timeout(60)
    ok(estado(pg)["ajustes"]["nivel"] == 3, "o nível é guardado")
    pg.click('[data-pane="hoje"]')
    pg.wait_for_timeout(80)
    ok("45s / 15s" in pg.inner_text("#pane-hoje"), "o nível 3 muda o ritmo do circuito")

    ok(not erros, "nenhum erro de javascript no caminho todo", erros)

    pg.set_viewport_size({"width": 320, "height": 568})
    pg.wait_for_timeout(80)
    largura = pg.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    ok(largura <= 1, "cabe num celular pequeno sem rolar para o lado", largura)

    pg.screenshot(path=str(Path(__file__).parent / "tela-hoje.png"))

    # ------------------------------------------------------------------
    # Quando o navegador nao guarda nada
    # ------------------------------------------------------------------
    # Tres jeitos diferentes de perder tudo, que para quem usa parecem a
    # mesma coisa: "sumiu". O app nao consegue impedir nenhum dos tres — quem
    # apaga e o navegador —, mas nao pode deixar a pessoa achar que o app
    # esta quebrado.
    print("\nQuando o navegador não guarda nada")

    RECUSA = """
    Object.defineProperty(window, 'localStorage', { configurable:true, get(){
      return { getItem(){ return null; }, setItem(){ throw new DOMException('recusado'); },
               removeItem(){}, clear(){} };
    }});
    """
    ESQUECE = """
    (() => { let m = {};
      Object.defineProperty(window, 'localStorage', { configurable:true, get(){
        return { getItem:(k)=> (k in m ? m[k] : null), setItem:(k,v)=>{ m[k]=String(v); },
                 removeItem:(k)=>{ delete m[k]; }, clear:()=>{ m={}; } };
      }});
    })();
    """

    def faixa(pagina):
        el = pagina.query_selector("#alerta:not([hidden])")
        return el.inner_text().strip() if el else ""

    ctx2 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
    p2 = ctx2.new_page()
    p2.add_init_script(RECUSA)
    p2.goto(APP.as_uri())
    p2.wait_for_selector(".hero .valor")
    ok("não está guardando nada" in faixa(p2),
       "armazenamento recusado: avisa já na primeira abertura", faixa(p2)[:60])
    p2.click('[data-tempo="45"]')
    p2.wait_for_timeout(80)
    ok(p2.query_selector_all(".toast") == [],
       "e não fica piscando o mesmo aviso a cada gravação")
    p2.click('#alerta [data-acao="fechar"]')
    p2.wait_for_timeout(50)
    ok(faixa(p2) == "", "dá para fechar a faixa")
    ctx2.close()

    ctx3 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
    p3 = ctx3.new_page()
    p3.add_init_script(ESQUECE)
    p3.goto(APP.as_uri())
    p3.wait_for_selector(".hero .valor")
    ok(faixa(p3) == "", "armazenamento que esquece: nada a acusar na primeira abertura", faixa(p3)[:60])
    p3.click('[data-tempo="45"]')
    p3.wait_for_timeout(80)
    p3.reload()
    p3.wait_for_selector(".hero .valor")
    ok("apagou o que você tinha feito" in faixa(p3),
       "e acusa a perda exatamente quando ela acontece", faixa(p3)[:60])
    ctx3.close()

    # Dentro de uma moldura: visualizador de anexo, prévia de mensagem.
    moldura = Path(__file__).resolve().parent / "dist" / "_moldura_teste.html"
    moldura.write_text('<!doctype html><meta charset="utf-8">'
                       '<iframe src="index.html" style="width:100%;height:98vh;border:0"></iframe>',
                       encoding="utf-8")
    try:
        ctx4 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
        p4 = ctx4.new_page()
        p4.goto(moldura.as_uri())
        dentro = p4.frame_locator("iframe")
        dentro.locator(".hero .valor").wait_for()
        ok(dentro.locator("#alerta").is_visible(), "dentro de uma moldura, avisa que é prévia")
        ok("prévia" in dentro.locator("#alerta").inner_text(),
           "e diz o que fazer", dentro.locator("#alerta").inner_text()[:60])
        ctx4.close()
    finally:
        moldura.unlink(missing_ok=True)

    navegador.close()

print("\n%d testes, %d falhas" % (len(feitas), len(falhas)))
if falhas:
    print("Falhou: " + ", ".join(falhas))
    sys.exit(1)
