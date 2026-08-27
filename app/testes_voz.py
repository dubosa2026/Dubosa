"""O que o app entende quando voce fala — e quando ele se cala.

    python3 app/testes_voz.py

Duas partes:

1. Uma tabela de frases em portugues do jeito que se fala, cada uma com o
   que deveria virar. E o teste que mais pega regressao: mexer numa palavra
   do vocabulario costuma quebrar tres frases que ninguem lembrava.
2. As regras da escuta — quem pode ligar o microfone e o que o desliga.
   Aqui a tela e simulada, entao da para verificar o caso que importa: com
   a tela apagada, ninguem liga nada.
"""
import json
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent / "src"
falhas, feitas = [], []


def ok(cond, nome, extra=""):
    feitas.append(nome)
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else "  -> " + str(extra)))
    if not cond:
        falhas.append(nome)


def rodar(js):
    programa = ("const F=require('%s/formato.js');const N=require('%s/nucleo.js');"
                "const V=require('%s/voz.js');" % (SRC, SRC, SRC)) + js
    r = subprocess.run(["node", "-e", programa], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit(1)
    return json.loads(r.stdout)


# ------------------------------------------------------------------
# 1. A tabela de frases
# ------------------------------------------------------------------
# (frase, tipo, campos que precisam bater)
TABELA = [
    # gasto do dia a dia, do jeito mais comum
    ("gastei 45 no mercado", "lancamento", {"valor": 45, "tipo": "saida", "categoria": "mercado"}),
    ("paguei 120 de luz", "lancamento", {"valor": 120, "categoria": "contas"}),
    ("almoço 32", "lancamento", {"valor": 32, "categoria": "comida"}),
    ("mercado 87,50", "lancamento", {"valor": 87.5, "categoria": "mercado"}),
    ("uber 18 reais", "lancamento", {"valor": 18, "categoria": "transporte"}),
    ("233 de gasolina", "lancamento", {"valor": 233, "categoria": "transporte"}),
    ("comprei um tênis de 359,90", "lancamento", {"valor": 359.9, "categoria": "roupa"}),
    ("gastei 89 na farmácia", "lancamento", {"valor": 89, "categoria": "saude"}),
    ("ração do cachorro 145", "lancamento", {"valor": 145, "categoria": "pet"}),
    # numero falado por extenso — o celular transcreve assim com frequencia
    ("gastei quarenta e cinco reais no mercado", "lancamento", {"valor": 45, "categoria": "mercado"}),
    ("paguei cento e vinte de internet", "lancamento", {"valor": 120, "categoria": "contas"}),
    ("recebi mil e duzentos", "lancamento", {"valor": 1200, "tipo": "entrada"}),
    ("trinta reais e cinquenta centavos de lanche", "lancamento", {"valor": 30.5, "categoria": "comida"}),
    # entrada
    ("recebi 3000 de salário", "lancamento", {"valor": 3000, "tipo": "entrada", "categoria": "salario"}),
    ("caiu 1500 do freela", "lancamento", {"valor": 1500, "tipo": "entrada", "categoria": "extra"}),
    ("vendi a bicicleta por 800", "lancamento", {"valor": 800, "tipo": "entrada"}),
    # conta fixa
    ("aluguel 1800 todo dia 10", "fixo", {"valor": 1800, "ciclo": "mensal", "dia": 10}),
    ("netflix 39,90 por mês", "fixo", {"valor": 39.9, "ciclo": "mensal", "categoria": "assinatura"}),
    ("salário 5200 todo dia 5", "fixo", {"valor": 5200, "tipo": "entrada", "dia": 5}),
    ("academia 89 todo mês", "fixo", {"valor": 89, "ciclo": "mensal"}),
    # saldo
    ("meu saldo é 2450", "saldo", {"valor": 2450}),
    ("tenho 3180 na conta", "saldo", {"valor": 3180}),
    # perguntas
    ("quanto posso gastar hoje", "pergunta", {"pergunta": "limite"}),
    ("quanto posso gastar hoje?", "pergunta", {"pergunta": "limite"}),
    ("dá pra gastar quanto hoje", "pergunta", {"pergunta": "limite"}),
    ("qual o meu saldo", "pergunta", {"pergunta": "saldo"}),
    ("como estou", "pergunta", {"pergunta": "resumo"}),
    ("me dá um resumo", "pergunta", {"pergunta": "resumo"}),
    ("quanto vou ter no fim do mês", "pergunta", {"pergunta": "projecao", "horizonte": "mes"}),
    ("quanto vou ter no fim do ano", "pergunta", {"pergunta": "projecao", "horizonte": "ano"}),
    ("quanto gastei com mercado esse mês", "pergunta", {"pergunta": "gasto", "categoria": "mercado"}),
    ("quanto eu gastei hoje", "pergunta", {"pergunta": "gasto", "periodo": "dia"}),
    ("me dá um conselho", "pergunta", {"pergunta": "conselho"}),
    ("como faço pra sair do vermelho", "pergunta", {"pergunta": "conselho"}),
    ("estou no negativo", "pergunta", {"pergunta": "conselho"}),
    # comandos
    ("apaga o último", "comando", {"comando": "desfazer"}),
    ("desfazer", "comando", {"comando": "desfazer"}),
    ("pode parar", "comando", {"comando": "parar"}),
    # o que nao da para entender tem de dizer que nao deu
    ("bom dia", "nada", {}),
    ("mercado", "nada", {}),
]

print("\n== o que ele entende ==")
res = rodar("const casos=%s;console.log(JSON.stringify(casos.map(c=>V.interpretar(c))));"
            % json.dumps([t[0] for t in TABELA]))
for (frase, tipo, campos), r in zip(TABELA, res):
    if r["tipo"] != tipo:
        ok(False, '"%s"' % frase, "veio %s, esperava %s" % (r["tipo"], tipo))
        continue
    corpo = r.get("lancamento") or r.get("fixo") or r
    erros = {k: (corpo.get(k), v) for k, v in campos.items() if corpo.get(k) != v}
    ok(not erros, '"%s"' % frase, erros)

print("\n== datas faladas ==")
r = rodar("console.log(JSON.stringify({"
          "ontem:V.interpretar('gastei 30 no mercado ontem').lancamento.data,"
          "anteontem:V.interpretar('paguei 50 anteontem').lancamento.data,"
          "hoje:V.interpretar('gastei 20 hoje').lancamento.data,"
          "diaX:V.interpretar('paguei 200 dia 3').lancamento.data,"
          "h:F.hoje(),o:F.somarDias(F.hoje(),-1),a:F.somarDias(F.hoje(),-2)}));")
ok(r["ontem"] == r["o"], "'ontem' vira a data de ontem", r)
ok(r["anteontem"] == r["a"], "'anteontem' vira anteontem", r)
ok(r["hoje"] == r["h"], "'hoje' é hoje", r)
ok(r["diaX"][8:10] == "03" and r["diaX"] <= r["h"],
   "'dia 3' é o dia 3 mais recente, nunca no futuro", r["diaX"])

print("\n== o valor não é confundido com a data ==")
r = rodar("console.log(JSON.stringify(V.interpretar('aluguel 1800 todo dia 10')));")
ok(r["fixo"]["valor"] == 1800 and r["fixo"]["dia"] == 10,
   "'1800 todo dia 10' não vira R$ 10 nem dia 1800", r["fixo"])
r = rodar("console.log(JSON.stringify(V.interpretar('gastei 45 no mercado dia 12')));")
ok(r["lancamento"]["valor"] == 45 and r["lancamento"]["data"][8:10] == "12",
   "'45 ... dia 12' separa valor de data", r["lancamento"])

print("\n== a descrição sai limpa ==")
r = rodar("console.log(JSON.stringify(['gastei 45 no mercado','uber 18 reais ontem',"
          "'paguei 89 de ração pro cachorro','recebi mil e duzentos do freela']"
          ".map(t=>V.interpretar(t).lancamento.descricao)));")
ok(r == ["Mercado", "Uber", "Ração pro cachorro", "Freela"],
   "só sobra o que descreve o gasto, com acento e tudo", r)

# ------------------------------------------------------------------
# 2. A escuta
# ------------------------------------------------------------------
MOTOR = """
function fazerMotor(){
  const reg = {starts:0, stops:0, vivo:false, inst:null};
  class Falso {
    constructor(){ reg.inst = this; }
    start(){ if(reg.vivo) throw new Error('ja'); reg.vivo=true; reg.starts++; }
    stop(){ reg.vivo=false; reg.stops++; if(this.onend) this.onend(); }
    abort(){ this.stop(); }
  }
  return {reg, Falso};
}
function ouvintes(){ const m={}; return {
  addEventListener:(n,f)=>{ (m[n]=m[n]||[]).push(f); },
  disparar:(n)=>{ (m[n]||[]).forEach(f=>f()); } }; }
"""

print("\n== a trava da tela ==")
r = rodar(MOTOR + """
const {reg, Falso} = fazerMotor();
let visivel = true;
const doc = ouvintes(), win = ouvintes();
const estados = [];
const e = V.criarEscuta({motor:Falso, doc, win, telaVisivel:()=>visivel,
  onEstado:(s,x)=>estados.push([s,(x&&x.motivo)||''])});

const ligou = e.ligar();
const depoisDeLigar = {ligou, vivo:reg.vivo, starts:reg.starts};

// a tela apaga
visivel = false; doc.disparar('visibilitychange');
const comTelaApagada = {vivo:reg.vivo, stops:reg.stops};

// tentar ligar com a tela apagada
const tentou = e.ligar();
const tentativa = {tentou, vivo:reg.vivo, starts:reg.starts};

// a tela volta — nao pode religar sozinho
visivel = true; doc.disparar('visibilitychange');
const voltou = {vivo:reg.vivo, starts:reg.starts};

// agora sim, com um toque
const religou = e.ligar();
const comToque = {religou, vivo:reg.vivo};

// trocar de aplicativo (blur) tambem derruba
win.disparar('blur');
const comBlur = {vivo:reg.vivo};

console.log(JSON.stringify({depoisDeLigar, comTelaApagada, tentativa, voltou, comToque, comBlur, estados}));
""")
ok(r["depoisDeLigar"] == {"ligou": True, "vivo": True, "starts": 1}, "com a tela acesa, um toque liga", r["depoisDeLigar"])
ok(r["comTelaApagada"]["vivo"] is False, "TELA APAGOU: o microfone desliga na hora", r["comTelaApagada"])
ok(r["tentativa"] == {"tentou": False, "vivo": False, "starts": 1},
   "com a tela apagada, nem toque liga o microfone", r["tentativa"])
ok(r["voltou"] == {"vivo": False, "starts": 1},
   "voltando ao app ele NÃO religa sozinho — espera outro toque", r["voltou"])
ok(r["comToque"] == {"religou": True, "vivo": True}, "com outro toque, volta a ouvir", r["comToque"])
ok(r["comBlur"]["vivo"] is False, "trocar de aplicativo (blur) também desliga", r["comBlur"])
ok(["bloqueado", "tela"] in [[a, b] for a, b in r["estados"]]
   or any(a == "bloqueado" for a, b in r["estados"]),
   "a tela é avisada de que o microfone foi bloqueado", r["estados"])


print("\n== uma fala, um lançamento (o defeito do celular de verdade) ==")
# O motor do Android manda, a cada evento, a LISTA INTEIRA de resultados com
# `resultIndex` em 0 — e não só o pedaço novo. Quem confia nesse índice
# processa a mesma frase de novo a cada palavra reconhecida: um "gastei 50 no
# uber" vira quatro lançamentos de R$ 50. Este teste imita esse motor.
r = rodar("""
const doc = {addEventListener:()=>{}}, win = {addEventListener:()=>{}};
const ouvidas = [];
let inst = null;
class Android {
  constructor(){ inst = this; this.res = []; }
  start(){ this.res = []; }
  stop(){ if(this.onend) this.onend(); }
  abort(){ this.stop(); }
  /* Cada evento repete tudo o que ja veio, com resultIndex 0. */
  emitir(texto, final){
    if (this.res.length && !this.res[this.res.length-1].isFinal) this.res.pop();
    this.res.push(Object.assign([{transcript:texto, confidence:.9}], {isFinal:!!final, length:1}));
    this.onresult({ resultIndex: 0, results: this.res });
  }
}
const e = V.criarEscuta({motor:Android, doc, win, telaVisivel:()=>true,
  onTexto:(t)=>ouvidas.push(t)});
e.ligar();
inst.emitir('gastei', false);
inst.emitir('gastei 50', false);
inst.emitir('gastei 50 no uber', true);
inst.emitir('almoco', false);
inst.emitir('almoco 32', true);
inst.emitir('mercado 90', true);
console.log(JSON.stringify({ouvidas}));
""")
ok(r["ouvidas"] == ["gastei 50 no uber", "almoco 32", "mercado 90"],
   "três falas viram três lançamentos, não doze", r["ouvidas"])

print("\n== eco do motor não vira gasto novo ==")
r = rodar("""
const doc = {addEventListener:()=>{}}, win = {addEventListener:()=>{}};
const ouvidas = [];
let inst = null;
class Ecoante {
  constructor(){ inst = this; this.res = []; }
  start(){ this.res = []; }
  stop(){ if(this.onend) this.onend(); }
  abort(){ this.stop(); }
  /* Repete o mesmo final num indice novo — alguns motores fazem isso. */
  emitir(texto){
    this.res.push(Object.assign([{transcript:texto, confidence:.9}], {isFinal:true, length:1}));
    this.onresult({ resultIndex: this.res.length-1, results: this.res });
  }
}
const e = V.criarEscuta({motor:Ecoante, doc, win, telaVisivel:()=>true,
  onTexto:(t)=>ouvidas.push(t)});
e.ligar();
inst.emitir('gastei 50 no uber');
inst.emitir('gastei 50 no uber');
console.log(JSON.stringify({ouvidas}));
""")
ok(r["ouvidas"] == ["gastei 50 no uber"],
   "a mesma frase repetida na hora conta uma vez só", r["ouvidas"])

print("\n== modo contínuo desligado (é nele que o Android duplica) ==")
r = rodar(MOTOR + """
const {reg, Falso} = fazerMotor();
const doc = ouvintes(), win = ouvintes();
const e = V.criarEscuta({motor:Falso, doc, win, telaVisivel:()=>true});
e.ligar();
const i = reg.inst;
console.log(JSON.stringify({continuo:i.continuous, parciais:i.interimResults, idioma:i.lang}));
""")
ok(r["continuo"] is False, "pede uma frase por sessão, não escuta acumulada", r)
ok(r["parciais"] is True, "mas continua mostrando o que está ouvindo", r)
ok(r["idioma"] == "pt-BR", "em português do Brasil", r)

print("\n== a escuta continua mesmo sem o modo contínuo ==")
r = rodar(MOTOR + """
const {reg, Falso} = fazerMotor();
const doc = ouvintes(), win = ouvintes();
const e = V.criarEscuta({motor:Falso, doc, win, telaVisivel:()=>true});
e.ligar();
/* O motor encerra sozinho depois de cada frase, como o do celular faz. */
reg.vivo = false; reg.inst.onend();
console.log(JSON.stringify({vivo:reg.vivo, starts:reg.starts}));
""")
ok(r["vivo"] is True and r["starts"] == 2,
   "acabou uma frase, ele reabre sozinho para a próxima", r)

print("\n== silêncio prolongado desliga sozinho ==")
r = rodar(MOTOR + """
const {reg, Falso} = fazerMotor();
const doc = ouvintes(), win = ouvintes();
const e = V.criarEscuta({motor:Falso, doc, win, telaVisivel:()=>true, silencioMs:40});
e.ligar();
setTimeout(()=>{ console.log(JSON.stringify({vivo:reg.vivo, stops:reg.stops})); }, 160);
""")
ok(r["vivo"] is False, "sem ninguém falando, o microfone se desliga", r)

print("\n== sem reconhecimento de voz no aparelho ==")
r = rodar("""
const doc={addEventListener:()=>{}}, win={addEventListener:()=>{}};
const e = V.criarEscuta({motor:null, doc, win, telaVisivel:()=>true});
console.log(JSON.stringify({disponivel:e.disponivel(), ligou:e.ligar(), ligado:e.ligado()}));
""")
ok(r == {"disponivel": False, "ligou": False, "ligado": False},
   "navegador sem reconhecimento de voz não quebra o app, só avisa", r)

if falhas:
    print("\n%d verificações, %d falhas: %s" % (len(feitas), len(falhas), ", ".join(falhas)))
    sys.exit(1)
print("\n%d verificações, nenhuma falha." % len(feitas))
