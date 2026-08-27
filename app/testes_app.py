"""O app inteiro num navegador de celular.

    python3 app/testes_app.py

Sobe o Chromium num viewport de telefone, abre `app/dist/index.html` e usa
o app como a pessoa usaria: fala, lanca, troca de aba, apaga.

O reconhecimento de voz de verdade nao roda em navegador de teste (nao ha
microfone nem servico de fala), entao aqui entra um motor falso que devolve
as frases na hora certa. E isso permite testar o que mais importa: **o
microfone morrer quando a tela apaga**, que e a regra da casa e nao daria
para verificar de outro jeito.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent / "dist" / "index.html"

falhas = []


feitas = []


def ok(cond, nome, extra=""):
    feitas.append(nome)
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else "  -> " + str(extra)))
    if not cond:
        falhas.append(nome)


# O motor falso. Guarda o que aconteceu com ele numa lista global da pagina
# para os testes conferirem depois: quantas vezes ligou, quantas parou.
MOTOR_FALSO = """
window.__voz = { starts: 0, stops: 0, vivo: false, inst: null };
class FakeRecognition {
  constructor(){ this.lang='pt-BR'; window.__voz.inst = this; }
  start(){
    if (window.__voz.vivo) throw new Error('ja iniciado');
    window.__voz.vivo = true; window.__voz.starts++;
  }
  stop(){ window.__voz.vivo = false; window.__voz.stops++; if (this.onend) this.onend(); }
  abort(){ this.stop(); }
  /* Empurra uma frase como se a pessoa tivesse falado. */
  dizer(texto){
    if (!window.__voz.vivo) return false;
    this.onresult({ resultIndex:0, results:[ Object.assign([{transcript:texto, confidence:.95}],
      { isFinal:true, length:1 }) ] });
    return true;
  }
}
window.SpeechRecognition = FakeRecognition;
window.webkitSpeechRecognition = FakeRecognition;
window.speechSynthesis = { speak(){}, cancel(){}, getVoices(){ return []; } };
window.SpeechSynthesisUtterance = function(){};
"""


def falar(pg, frase):
    """Simula a pessoa falando uma frase com o microfone ligado."""
    return pg.evaluate("(t) => window.__voz.inst && window.__voz.inst.dizer(t)", frase)


def estado(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('bussola.v1') || 'null')")


with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = nav.new_context(
        viewport={"width": 390, "height": 844},          # iPhone 14/15
        device_scale_factor=3, is_mobile=True, has_touch=True,
        locale="pt-BR", timezone_id="America/Sao_Paulo",
    )
    ctx.add_init_script(MOTOR_FALSO)
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.on("console", lambda m: erros.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(APP.as_uri())
    pg.wait_for_timeout(700)

    print("\n== abre limpo ==")
    ok(not erros, "abre sem erro de javascript", erros[:3])
    ok(pg.is_visible("#mic"), "o microfone está na tela")
    # innerText devolve o texto ja com o CSS aplicado, e o rotulo esta em
    # maiuscula por text-transform. Confere pelo titulo, que nao e alterado.
    ok("Três passos" in pg.inner_text("#pane-hoje"), "primeira abertura explica o começo",
       pg.inner_text("#pane-hoje")[:80])

    print("\n== saldo inicial ==")
    pg.fill("#saldoInicial", "2.450,00")
    pg.click("[data-acao=salvarSaldoInicial]")
    pg.wait_for_timeout(300)
    ok(estado(pg)["saldo"]["valor"] == 2450, "saldo salvo", estado(pg)["saldo"])
    ok("2,4 mil" in pg.inner_text("#chipSaldo") or "2.450" in pg.inner_text("#chipSaldo"),
       "saldo aparece no topo", pg.inner_text("#chipSaldo"))

    print("\n== a trava de tela do microfone ==")
    pg.click("#mic")
    pg.wait_for_timeout(200)
    ok(pg.get_attribute("#mic", "data-estado") == "ouvindo", "o microfone liga com um toque")
    ok(pg.evaluate("() => window.__voz.starts") == 1, "o motor foi iniciado uma vez")

    # A TELA APAGA. E o unico teste que o app existe para passar.
    pg.evaluate("""() => {
      Object.defineProperty(document, 'visibilityState', {value:'hidden', configurable:true});
      Object.defineProperty(document, 'hidden', {value:true, configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    pg.wait_for_timeout(250)
    ok(pg.evaluate("() => window.__voz.vivo") is False, "TELA APAGOU: o microfone desligou")
    ok(pg.get_attribute("#mic", "data-estado") == "parado", "o botão volta a ficar apagado")

    # Falar com a tela apagada nao pode entrar nada.
    antes = len(estado(pg)["lancamentos"])
    falar(pg, "gastei 500 reais escondido")
    pg.wait_for_timeout(200)
    ok(len(estado(pg)["lancamentos"]) == antes, "com a tela apagada, nada é lançado")

    # Tentar ligar com a tela apagada tambem nao pode.
    pg.evaluate("() => document.querySelector('#mic').click()")
    pg.wait_for_timeout(200)
    ok(pg.evaluate("() => window.__voz.vivo") is False, "com a tela apagada o microfone nem liga")

    # A tela volta: ele NAO pode voltar a ouvir sozinho.
    pg.evaluate("""() => {
      Object.defineProperty(document, 'visibilityState', {value:'visible', configurable:true});
      Object.defineProperty(document, 'hidden', {value:false, configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
    }""")
    pg.wait_for_timeout(400)
    ok(pg.evaluate("() => window.__voz.vivo") is False,
       "voltando ao app, o microfone continua desligado até você tocar")

    print("\n== falar gastos ==")
    pg.click("#mic")
    pg.wait_for_timeout(200)
    falar(pg, "gastei 45 no mercado")
    pg.wait_for_timeout(300)
    lanc = estado(pg)["lancamentos"]
    ok(len(lanc) == 1 and lanc[0]["valor"] == 45 and lanc[0]["categoria"] == "mercado",
       "'gastei 45 no mercado' virou lançamento", lanc)
    ok("desfazer" in pg.inner_text("#toast").lower(), "oferece desfazer")

    falar(pg, "recebi mil e duzentos de freela")
    pg.wait_for_timeout(300)
    lanc = estado(pg)["lancamentos"]
    entrada = [l for l in lanc if l["tipo"] == "entrada"]
    ok(entrada and entrada[0]["valor"] == 1200, "número por extenso vira entrada de 1200", entrada)

    falar(pg, "aluguel 1800 todo dia 10")
    pg.wait_for_timeout(300)
    fixos = estado(pg)["fixos"]
    ok(len(fixos) == 1 and fixos[0]["valor"] == 1800 and fixos[0]["dia"] == 10,
       "'todo dia 10' cria conta fixa", fixos)

    print("\n== a trava final contra repetição ==")
    # Mesmo que o microfone deixe passar um eco, o lançamento não pode
    # entrar duas vezes: é aqui que a fala vira dinheiro na conta.
    # Frase idêntica: quem barra é o microfone, em silêncio — eco não merece
    # aviso na tela.
    n_antes = len(estado(pg)["lancamentos"])
    falar(pg, "gastei 25 na padaria")
    pg.wait_for_timeout(250)
    falar(pg, "gastei 25 na padaria")
    pg.wait_for_timeout(300)
    ok(len(estado(pg)["lancamentos"]) == n_antes + 1,
       "a mesma fala repetida na hora entra uma vez só",
       len(estado(pg)["lancamentos"]) - n_antes)

    # Frases DIFERENTES que dão no mesmo lançamento: aqui o microfone não
    # tem como saber, e quem barra é a trava final — essa avisa.
    n_antes = len(estado(pg)["lancamentos"])
    falar(pg, "gastei 31 no cinema")
    pg.wait_for_timeout(250)
    falar(pg, "cinema 31 reais")
    pg.wait_for_timeout(300)
    ok(len(estado(pg)["lancamentos"]) == n_antes + 1,
       "duas falas diferentes com o mesmo gasto entram uma vez só",
       len(estado(pg)["lancamentos"]) - n_antes)
    ok("repetição" in pg.inner_text("#toast").lower(), "e a tela avisa que ignorou",
       pg.inner_text("#toast"))

    # Mas lançar de propósito pelo botão, duas vezes, tem de entrar duas.
    n_antes = len(estado(pg)["lancamentos"])
    for _ in range(2):
        pg.fill("#novoValor", "7")
        pg.select_option("#novaCat", "comida")
        pg.click("[data-acao=lancar]")
        pg.wait_for_timeout(250)
    ok(len(estado(pg)["lancamentos"]) == n_antes + 2,
       "dois toques no botão são dois cafés de propósito, e entram os dois",
       len(estado(pg)["lancamentos"]) - n_antes)

    print("\n== a versão aparece na tela ==")
    pg.click(".aba[data-pane=ajustes]")
    pg.wait_for_timeout(350)
    import re as _re
    rodape = pg.inner_text("#pane-ajustes")
    ok(_re.search(r"vers[ãa]o [a-f0-9]{8}", rodape.lower()) is not None,
       "os Ajustes dizem qual versão está rodando",
       rodape[-90:].replace("\n", " "))
    pg.click(".aba[data-pane=hoje]")
    pg.wait_for_timeout(300)

    print("\n== perguntas ==")
    falar(pg, "quanto posso gastar hoje")
    pg.wait_for_timeout(300)
    resposta = pg.inner_text("#toast")
    ok("pode gastar" in resposta.lower() or "teto" in resposta.lower(),
       "responde quanto pode gastar hoje", resposta)

    falar(pg, "quanto vou ter no fim do mês")
    pg.wait_for_timeout(300)
    ok("R$" in pg.inner_text("#toast"), "responde a projeção do mês", pg.inner_text("#toast"))

    print("\n== desfazer por voz ==")
    n_antes = len(estado(pg)["lancamentos"])
    falar(pg, "gastei 20 no lanche")
    pg.wait_for_timeout(250)
    falar(pg, "apaga o último")
    pg.wait_for_timeout(300)
    ok(len(estado(pg)["lancamentos"]) == n_antes, "'apaga o último' desfaz o lançamento",
       len(estado(pg)["lancamentos"]))

    print("\n== abas ==")
    for nome, marca in [("futuro", "Para onde isso vai"), ("conselhos", "O que eu faria"),
                        ("ajustes", "Ajustes")]:
        pg.click(".aba[data-pane=%s]" % nome)
        pg.wait_for_timeout(350)
        ok(marca in pg.inner_text("#pane-" + nome), "aba %s abre" % nome)

    pg.click(".aba[data-pane=futuro]")
    pg.wait_for_timeout(300)
    ok(pg.is_visible("#pane-futuro .grafico"), "o gráfico da projeção aparece")
    for h in ["dia", "semana", "mes", "ano"]:
        pg.click("[data-acao=horizonte][data-h=%s]" % h)
        pg.wait_for_timeout(250)
        ok(pg.is_visible("#pane-futuro .hero .valor"), "horizonte %s mostra número" % h,
           pg.inner_text("#pane-futuro .hero .valor") if pg.is_visible("#pane-futuro .hero") else "")

    print("\n== lançar digitando ==")
    pg.click(".aba[data-pane=hoje]")
    pg.wait_for_timeout(300)
    pg.fill("#novoValor", "89,90")
    pg.select_option("#novaCat", "comida")
    pg.click("[data-acao=lancar]")
    pg.wait_for_timeout(300)
    ok(any(l["valor"] == 89.9 for l in estado(pg)["lancamentos"]), "lançamento digitado entra")

    print("\n== trava por PIN ==")
    pg.click(".aba[data-pane=ajustes]")
    pg.wait_for_timeout(300)
    pg.fill("#pin", "4071")
    pg.click("[data-acao=salvarPin]")
    pg.wait_for_timeout(300)
    pg.reload()
    pg.wait_for_timeout(600)
    ok(pg.is_visible("#trava"), "com PIN, o app abre trancado")
    for d in "4071":
        pg.click(".teclado button[data-tecla='%s']" % d)
        pg.wait_for_timeout(80)
    pg.wait_for_timeout(300)
    ok(not pg.is_visible("#trava"), "o PIN certo abre")

    print("\n== dados sobrevivem ao recarregar ==")
    n = len(estado(pg)["lancamentos"])
    pg.reload()
    pg.wait_for_timeout(600)
    for d in "4071":
        pg.click(".teclado button[data-tecla='%s']" % d)
        pg.wait_for_timeout(60)
    pg.wait_for_timeout(300)
    ok(len(estado(pg)["lancamentos"]) == n, "os lançamentos continuam lá depois de recarregar")

    print("\n== não sobrou erro no console ==")
    ok(not erros, "nenhum erro de javascript na sessão inteira", erros[:4])

    print("\n== responsivo em tela pequena ==")
    pg.set_viewport_size({"width": 320, "height": 568})   # iPhone SE 1
    pg.wait_for_timeout(400)
    largura = pg.evaluate("() => document.documentElement.scrollWidth")
    ok(largura <= 322, "não estoura a largura em tela de 320px", largura)

    nav.close()

if falhas:
    print("\n%d verificações, %d falhas: %s" % (len(feitas), len(falhas), ", ".join(falhas)))
    sys.exit(1)
print("\n%d verificações, nenhuma falha." % len(feitas))
