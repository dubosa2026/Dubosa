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
import functools
import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent / "dist" / "index.html"


def servidor():
    """Um servidor local, porque o app publicado vive num endereço.

    Rodar o teste em `file://` escondia metade do comportamento: sem
    endereço não há service worker, o navegador nunca oferece instalação, e
    o app (com razão) passa a dizer isso na tela — o que fazia os testes de
    instalação medirem o caso errado. Aqui o grosso do teste roda como a
    pessoa vai usar, por um endereço; o caso do arquivo baixado tem o seu
    cenário próprio, no fim.
    """
    pasta = str(APP.parent)

    class Quieto(http.server.SimpleHTTPRequestHandler):
        # Sem isto o servidor escreve uma linha por arquivo servido e afoga
        # o resultado do teste, que é o que alguém veio ler aqui.
        def log_message(self, *args):
            pass

    trata = functools.partial(Quieto, directory=pasta)
    casa = socketserver.TCPServer(("127.0.0.1", 0), trata)
    casa.daemon_threads = True
    threading.Thread(target=casa.serve_forever, daemon=True).start()
    return casa, "http://127.0.0.1:%d/" % casa.server_address[1]


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


def faixa(pagina):
    """O texto da faixa de aviso do topo, ou vazio quando não há aviso."""
    el = pagina.query_selector("#alerta:not([hidden])")
    return el.inner_text().strip() if el else ""


casa, BASE = servidor()

with sync_playwright() as p:
    navegador = abrir_navegador(p)
    ctx = navegador.new_context(viewport={"width": 390, "height": 844},
                                device_scale_factor=2, locale="pt-BR")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.clock.install()
    pg.goto(BASE)
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

    print("\nOnde vou treinar")

    def barulhentos_de_hoje():
        """Os exercícios do treino de hoje que fazem barulho no andar de baixo.

        Lido do próprio estado do app e cruzado com o catálogo que ele
        carregou, em vez de procurar nomes na tela: se amanhã entrar um
        exercício de impacto novo, este teste pega sozinho."""
        return pg.evaluate("""() => {
          const e = JSON.parse(localStorage.getItem('circuito.v1'));
          const t = e.doDia.treino;
          const ids = t.aquecimento
            .concat(t.blocos.reduce((a, b) => a.concat(b.exercicios), []))
            .concat(t.solta);
          return ids.filter((i) => window.Exercicios.porId(i).impacto === 'alto');
        }""")

    pg.click('[data-pane="hoje"]')
    pg.wait_for_selector(".hero .valor")
    ok(pg.get_attribute('[data-local="apartamento"]', "aria-pressed") == "true",
       "o app começa em apartamento")
    ok(barulhentos_de_hoje() == [],
       "em apartamento não entra nada que faça barulho embaixo", barulhentos_de_hoje())

    pg.click('[data-local="academia"]')
    pg.wait_for_timeout(80)
    precisa = pg.inner_text("#pane-hoje")
    ok("Academia" in precisa, "a tela diz onde é o treino")
    equipamento_academia = pg.evaluate(
        "() => window.Montador.equipamentoNecessario("
        "JSON.parse(localStorage.getItem('circuito.v1')).doDia.treino)")
    ok(equipamento_academia != [],
       "na academia o treino já usa os pesos, sem precisar configurar nada", equipamento_academia)

    pg.click('[data-local="ar-livre"]')
    pg.wait_for_timeout(80)
    ok(set(pg.evaluate(
        "() => window.Montador.equipamentoNecessario("
        "JSON.parse(localStorage.getItem('circuito.v1')).doDia.treino)")) <= {"elastico", "corda"},
       "no ar livre só entra o que dá para levar")

    print("\nCada lugar guarda o seu equipamento")
    pg.click('[data-pane="ajustes"]')
    pg.wait_for_selector('input[data-equip="halter"]')
    pg.click('#pane-ajustes [data-local="casa"]')
    pg.wait_for_timeout(60)
    pg.check('input[data-equip="halter"]')
    pg.wait_for_timeout(60)
    ok(pg.is_checked('input[data-equip="halter"]'), "liguei o halter em casa")
    pg.click('#pane-ajustes [data-local="ar-livre"]')
    pg.wait_for_timeout(60)
    ok(not pg.is_checked('input[data-equip="halter"]'),
       "e o halter de casa não virou halter do parque")
    pg.click('#pane-ajustes [data-local="casa"]')
    pg.wait_for_timeout(60)
    ok(pg.is_checked('input[data-equip="halter"]'), "voltando para casa, o halter continua lá")

    guardado = pg.evaluate("() => JSON.parse(localStorage.getItem('circuito.v1')).ajustes.locais")
    ok(guardado["casa"]["equipamentos"] == ["halter"], "e ficou guardado por lugar", guardado["casa"])
    ok(guardado["apartamento"]["semImpacto"] is True,
       "o apartamento continua sem barulho", guardado["apartamento"])

    pg.click('[data-pane="hoje"]')
    pg.wait_for_selector(".hero .valor")
    pg.click('[data-local="apartamento"]')
    pg.wait_for_timeout(80)

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

    print("\nEvolução do corpo")
    pg.click('[data-pane="historico"]')
    pg.wait_for_selector('[data-evo="corpo"]')
    ok("Evolução" in pg.inner_text("#pane-historico h2"), "a aba se chama Evolução")
    pg.click('[data-evo="corpo"]')
    pg.wait_for_selector("#campoAltura")
    ok("altura" in pg.inner_text("#pane-historico").lower(),
       "sem altura, o app pede a altura antes de falar de IMC")

    pg.fill("#campoAltura", "178")
    pg.click('[data-acao="salvar-altura"]')
    pg.wait_for_timeout(120)
    ok(estado(pg)["ajustes"]["altura"] == 178, "a altura é guardada")

    pg.fill('[data-medida="peso"]', "84,2")
    pg.fill('[data-medida="cintura"]', "95")
    pg.click('[data-acao="anotar"]')
    pg.wait_for_timeout(150)
    medidas = estado(pg)["medidas"]
    ok(len(medidas) == 1, "a anotação entrou", medidas)
    ok(medidas[0]["peso"] == 84.2, "e a vírgula do teclado brasileiro virou número",
       medidas[0].get("peso"))
    ok("26,6" in pg.inner_text("#pane-historico"), "o IMC aparece calculado",
       pg.inner_text("#pane-historico")[:80])
    ok("músculo" in pg.inner_text("#pane-historico"),
       "com a ressalva de que ele não sabe o que é músculo")

    # Anotar de novo no mesmo dia corrige, não duplica.
    pg.fill('[data-medida="peso"]', "83,9")
    pg.click('[data-acao="anotar"]')
    pg.wait_for_timeout(150)
    ok(len(estado(pg)["medidas"]) == 1, "anotar de novo hoje não cria segunda linha")
    ok(estado(pg)["medidas"][0]["peso"] == 83.9, "e o valor novo é o que vale")
    ok(estado(pg)["medidas"][0]["cintura"] == 95,
       "sem apagar a cintura que já estava lá", estado(pg)["medidas"][0])

    pg.fill('[data-medida="peso"]', "999")
    pg.click('[data-acao="anotar"]')
    pg.wait_for_timeout(120)
    ok(estado(pg)["medidas"][0]["peso"] == 83.9, "999 kg não entra")

    # Duas anotações em dias diferentes: a linha do gráfico aparece.
    pg.evaluate("""() => {
      const e = JSON.parse(localStorage.getItem('circuito.v1'));
      const d = new Date(); d.setDate(d.getDate() - 20);
      const p = x => String(x).padStart(2, '0');
      e.medidas.push({ id: 'antiga', peso: 86.5, cintura: 97,
        data: d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) });
      localStorage.setItem('circuito.v1', JSON.stringify(e));
    }""")
    pg.reload()
    pg.wait_for_selector(".hero .valor")
    pg.click('[data-pane="historico"]')
    pg.click('[data-evo="corpo"]')
    pg.wait_for_timeout(150)
    ok(pg.query_selector(".linha-grafico") is not None, "com duas anotações, o gráfico aparece")
    ok("-2,6 kg" in pg.inner_text("#pane-historico"),
       "e a variação do mês aparece escrita", pg.inner_text("#pane-historico")[-400:])

    pg.click('[data-campo="cintura"]')
    pg.wait_for_timeout(120)
    ok(pg.get_attribute('[data-campo="cintura"]', "aria-pressed") == "true",
       "dá para trocar o gráfico para a cintura")

    pg.click("[data-apagar-medida]")
    pg.wait_for_timeout(150)
    ok(len(estado(pg)["medidas"]) == 1, "apagar uma anotação funciona")
    pg.click(".toast button")
    pg.wait_for_timeout(150)
    ok(len(estado(pg)["medidas"]) == 2, "desfazer devolve")

    print("\nCarga e projeção")
    pg.click('[data-evo="treinos"]')
    pg.wait_for_timeout(150)
    texto_evo = pg.inner_text("#pane-historico")
    ok("Carga das últimas 8 semanas" in texto_evo, "a carga das semanas aparece")
    ok(len(pg.query_selector_all(".semanas i")) == 8, "com oito barras")
    ok("Tendência" in texto_evo, "a tendência aparece")
    ok("cedo para falar de tendência" in texto_evo,
       "e com pouco histórico ela diz que ainda é cedo, em vez de inventar",
       texto_evo[texto_evo.find("Tend"):][:120])
    ok("Este mês" in texto_evo, "e a projeção do mês")

    print("\nInstalar no celular")
    pg.click('[data-pane="ajustes"]')
    pg.wait_for_timeout(150)
    ajustes = pg.inner_text("#pane-ajustes")
    ok("Instalar no celular" in ajustes, "o cartão de instalar aparece nos Ajustes")
    ok("Chrome do Android" in ajustes,
       "e sem o convite do navegador ele ensina onde conseguir o botão")
    baixar = pg.query_selector('#pane-ajustes a[download]')
    ok(baixar is not None, "a versão publicada oferece baixar o programa")
    ok(baixar and baixar.get_attribute("href") == "circuito.html",
       "apontando para o arquivo que o build deixou do lado",
       baixar and baixar.get_attribute("href"))

    print("\nDiagnóstico da instalação")
    pg.click('[data-pane="ajustes"]')
    pg.wait_for_selector("#diagnostico .conta-fila")
    pg.wait_for_timeout(400)
    diag = pg.inner_text("#diagnostico")
    ok("Endereço" in diag and "Modo de exibição" in diag, "o diagnóstico lista o essencial", diag[:80])
    ok("Service worker" in diag, "e diz o estado do service worker", diag[:200])
    ok("ativo" in diag, "que aqui está ativo, porque há endereço", diag[diag.find("Service"):][:90])
    ok("Convite de instalação" in diag, "e se o navegador mandou o convite de instalação")
    ok(pg.query_selector('#diagnostico [data-acao="copiar"]') is not None,
       "com um botão para copiar tudo de uma vez")

    print("\nO link que abre direto na ajuda")
    pg.goto(BASE + "?ajuda=instalacao")
    pg.wait_for_selector("#diagnostico .conta-fila")
    ok(pg.get_attribute('[data-pane="ajustes"]', "aria-selected") == "true",
       "o link com ?ajuda=instalacao abre já nos Ajustes")
    ok(pg.is_visible("#diagnostico"), "com o diagnóstico na tela, sem ninguém procurar")
    pg.goto(BASE)
    pg.wait_for_selector(".hero .valor")
    ok(pg.get_attribute('[data-pane="hoje"]', "aria-selected") == "true",
       "e sem o link ele continua abrindo em Hoje")

    print("\nNavegador embutido em outro aplicativo")
    # Um WebView nao implementa a consulta `display-mode`: nenhum modo
    # responde. E a assinatura que o app usa para reconhecer o caso.
    SEM_MODO = """
    (() => { const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => String(q).indexOf('display-mode') >= 0
        ? { matches:false, media:q, addListener(){}, removeListener(){},
            addEventListener(){}, removeEventListener(){} }
        : real(q);
    })();
    """
    ctx6 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
    p6 = ctx6.new_page()
    p6.add_init_script(SEM_MODO)
    p6.goto(BASE)
    p6.wait_for_selector(".hero .valor")
    ok("não instala aplicativos" in faixa(p6),
       "a faixa avisa que ali não dá para instalar", faixa(p6)[:60])
    p6.click('[data-pane="ajustes"]')
    p6.wait_for_selector("#diagnostico .conta-fila")
    texto6 = p6.inner_text("#pane-ajustes")
    ok("dentro de outro aplicativo" in texto6,
       "os Ajustes explicam que o navegador é embutido", texto6[texto6.find("Instalar"):][:120])
    ok("Abrir no Chrome" in texto6, "e dizem exatamente o que tocar")
    ok("NÃO — navegador dentro de outro app" in p6.inner_text("#diagnostico"),
       "e o diagnóstico responde a pergunta direto")
    ctx6.close()

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

    ctx2 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
    p2 = ctx2.new_page()
    p2.add_init_script(RECUSA)
    p2.goto(BASE)
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
    p3.goto(BASE)
    p3.wait_for_selector(".hero .valor")
    ok("apagou" not in faixa(p3),
       "armazenamento que esquece: nada a acusar na primeira abertura", faixa(p3)[:60])
    p3.click('[data-tempo="45"]')
    p3.wait_for_timeout(80)
    p3.reload()
    p3.wait_for_selector(".hero .valor")
    ok("apagou o que você tinha feito" in faixa(p3),
       "e acusa a perda exatamente quando ela acontece", faixa(p3)[:60])
    ctx3.close()

    # Aberto como arquivo baixado: o botão de instalar não existe, e o app
    # tem que dizer isso em vez de deixar a pessoa procurando.
    ctx5 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
    p5 = ctx5.new_page()
    p5.goto(APP.as_uri())          # as_uri() é file://, que é o caso real do arquivo baixado
    p5.wait_for_selector(".hero .valor")
    ok("não dá para instalar assim" in faixa(p5),
       "arquivo baixado: a faixa avisa que ali não dá para instalar", faixa(p5)[:70])
    p5.click('[data-pane="ajustes"]')
    p5.wait_for_timeout(150)
    texto5 = p5.inner_text("#pane-ajustes")
    ok("não aparece em navegador nenhum" in texto5,
       "e os Ajustes explicam que não é limite do app", texto5[texto5.find("Instalar"):][:140])
    ok("endereço" in texto5, "e dizem o que fazer para conseguir o botão")
    ctx5.close()

    # Dentro de uma moldura: visualizador de anexo, prévia de mensagem.
    moldura = Path(__file__).resolve().parent / "dist" / "_moldura_teste.html"
    moldura.write_text('<!doctype html><meta charset="utf-8">'
                       '<iframe src="index.html" style="width:100%;height:98vh;border:0"></iframe>',
                       encoding="utf-8")
    try:
        ctx4 = navegador.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR")
        p4 = ctx4.new_page()
        p4.goto(BASE + "_moldura_teste.html")
        dentro = p4.frame_locator("iframe")
        dentro.locator(".hero .valor").wait_for()
        ok(dentro.locator("#alerta").is_visible(), "dentro de uma moldura, avisa que é prévia")
        ok("prévia" in dentro.locator("#alerta").inner_text(),
           "e diz o que fazer", dentro.locator("#alerta").inner_text()[:60])
        ctx4.close()
    finally:
        moldura.unlink(missing_ok=True)

    navegador.close()

casa.shutdown()

print("\n%d testes, %d falhas" % (len(feitas), len(falhas)))
if falhas:
    print("Falhou: " + ", ".join(falhas))
    sys.exit(1)
