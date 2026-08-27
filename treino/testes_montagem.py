"""A matemática do treino, conferida por fora.

    python3 treino/testes_montagem.py

Roda os módulos do app no node (eles são JS puro, sem navegador) e refaz
cada conta aqui em Python, na mão. Se as duas contas concordam, o circuito
que aparece na tela não é um acidente de implementação.

É o teste que guarda as três promessas do app:

1. **O tempo pedido é uma promessa.** 20 minutos pedidos têm que virar ~20
   minutos montados, contando aquecimento, descanso e alongamento.
2. **Só entra o que a pessoa tem.** Nunca um halter para quem não marcou
   halter, nunca um polichinelo para quem pediu silêncio.
3. **Nunca dois padrões iguais seguidos.** É o que deixa terminar o
   circuito sem parar no meio.
"""
import datetime
import json
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent / "src"
falhas = []
feitas = []


def ok(cond, nome, extra=""):
    feitas.append(nome)
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else "  -> " + str(extra)))
    if not cond:
        falhas.append(nome)


def rodar(js):
    """Executa um trecho de JS com os módulos do app carregados."""
    programa = (
        "const F=require('%s/formato.js');"
        "const X=require('%s/exercicios.js');"
        "const M=require('%s/montador.js');"
        "const R=require('%s/relogio.js');"
        "const P=require('%s/progresso.js');" % (SRC, SRC, SRC, SRC, SRC)
    ) + js
    r = subprocess.run(["node", "-e", programa], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit(1)
    return json.loads(r.stdout)


CATALOGO = rodar("console.log(JSON.stringify(X.LISTA))")
POR_ID = {e["id"]: e for e in CATALOGO}

# ------------------------------------------------------------------
# 1. O tempo pedido é uma promessa
# ------------------------------------------------------------------
print("\nO tempo prometido")

PEDIDOS = [(10, 1), (15, 2), (20, 1), (20, 2), (20, 3), (30, 2), (40, 3), (45, 2), (60, 3)]
treinos = rodar(
    "const saida=%s.map(([min,nv]) => {"
    "  const t=M.montar({minutos:min,nivel:nv,semente:'teste-'+min+'-'+nv,"
    "    equipamentos:['halter','elastico','caixa']});"
    "  return {pedido:min, nivel:nv, treino:t, duracao:M.duracao(t),"
    "          passos:M.passos(t).map(p=>({tipo:p.tipo,segundos:p.segundos,ex:p.exercicio||null,"
    "            rodada:p.rodada||null,rodadas:p.rodadas||null}))};"
    "});"
    "console.log(JSON.stringify(saida));" % json.dumps(PEDIDOS)
)

for caso in treinos:
    pedido, t = caso["pedido"], caso["treino"]
    erro = abs(caso["duracao"] - pedido * 60) / (pedido * 60)
    ok(erro <= 0.08, "%d min (nível %d) montam %.1f min" % (pedido, caso["nivel"], caso["duracao"] / 60),
       "erro de %.0f%%" % (erro * 100))

print("\nA duração, refeita à mão em Python")
for caso in treinos:
    t = caso["treino"]
    # Aquecimento e volta à calma: um passo de preparação e um por exercício.
    esperado = 0
    if t["aquecimento"]:
        esperado += 10 + len(t["aquecimento"]) * t["tempoAquecimento"]
    for b in t["blocos"]:
        est, rod = len(b["exercicios"]), b["rodadas"]
        # Dentro da rodada há um descanso a menos que o número de estações:
        # a última emenda no intervalo entre rodadas (ou no fim do bloco).
        rodada = est * b["trabalho"] + (est - 1) * b["descanso"]
        esperado += 10 + rod * rodada + (rod - 1) * b["entreRodadas"]
    if t["solta"]:
        esperado += 10 + len(t["solta"]) * t["tempoSolta"]
    ok(esperado == caso["duracao"], "%d min: a conta do Python bate com a do app" % caso["pedido"],
       (esperado, caso["duracao"]))

# ------------------------------------------------------------------
# 2. O desenho do circuito
# ------------------------------------------------------------------
print("\nO desenho do circuito")
for caso in treinos:
    t = caso["treino"]
    pedido = caso["pedido"]
    ok(len(t["aquecimento"]) >= 3, "%d min: sempre tem aquecimento" % pedido, len(t["aquecimento"]))
    ok(len(t["solta"]) >= 2, "%d min: sempre tem volta à calma" % pedido, len(t["solta"]))
    ok(all(b["rodadas"] >= 2 for b in t["blocos"]), "%d min: nenhum bloco de uma rodada só" % pedido)
    ok(all(3 <= len(b["exercicios"]) <= 6 for b in t["blocos"]),
       "%d min: entre 3 e 6 estações por bloco" % pedido,
       [len(b["exercicios"]) for b in t["blocos"]])

    seguidos = []
    for b in t["blocos"]:
        padroes = [POR_ID[i]["padrao"] for i in b["exercicios"]]
        # O circuito dá voltas: a última estação emenda na primeira da
        # rodada seguinte, então esse par também conta.
        for a, c in zip(padroes, padroes[1:] + padroes[:1]):
            if a == c:
                seguidos.append((a, c))
    ok(not seguidos, "%d min: nunca dois padrões iguais seguidos" % pedido, seguidos)

    repetidos = [b for b in t["blocos"] if len(set(b["exercicios"])) != len(b["exercicios"])]
    ok(not repetidos, "%d min: nenhum exercício repetido dentro do bloco" % pedido, repetidos)

# ------------------------------------------------------------------
# 3. Só entra o que a pessoa tem
# ------------------------------------------------------------------
print("\nEquipamento, impacto e nível")

sem_nada = rodar(
    "const t=M.montar({minutos:20,nivel:2,equipamentos:[],semente:'vazio'});"
    "console.log(JSON.stringify({t:t, ids:M.equipamentoNecessario(t)}));"
)
ok(sem_nada["ids"] == [], "sem equipamento, o treino é só peso do corpo", sem_nada["ids"])

so_elastico = rodar(
    "const t=M.montar({minutos:30,nivel:3,equipamentos:['elastico'],semente:'el'});"
    "console.log(JSON.stringify(M.equipamentoNecessario(t)));"
)
ok(set(so_elastico) <= {"elastico"}, "com elástico só, nada de halter", so_elastico)

quieto = rodar(
    "const t=M.montar({minutos:30,nivel:3,semImpacto:true,equipamentos:['halter'],semente:'q'});"
    "const ids=t.aquecimento.concat(t.blocos.reduce((a,b)=>a.concat(b.exercicios),[])).concat(t.solta);"
    "console.log(JSON.stringify(ids.map(i=>X.porId(i).impacto)));"
)
ok("alto" not in quieto, "sem pulo não sobra nenhum exercício de impacto",
   quieto.count("alto"))

nivel1 = rodar(
    "const t=M.montar({minutos:30,nivel:1,equipamentos:['halter','caixa','barra'],semente:'n1'});"
    "console.log(JSON.stringify(t.blocos.reduce((a,b)=>a.concat(b.exercicios),[]).map(i=>X.porId(i).nivel)));"
)
ok(max(nivel1) <= 1, "nível 1 não recebe exercício de nível 3", nivel1)

# ------------------------------------------------------------------
# 4. A mesma semente, o mesmo treino
# ------------------------------------------------------------------
print("\nO sorteio semeado")
igual = rodar(
    "const a=M.montar({minutos:25,semente:'2026-08-27|x'});"
    "const b=M.montar({minutos:25,semente:'2026-08-27|x'});"
    "const c=M.montar({minutos:25,semente:'2026-08-28|x'});"
    "console.log(JSON.stringify({iguais: JSON.stringify(a)===JSON.stringify(b),"
    "  diferentes: JSON.stringify(a)!==JSON.stringify(c)}));"
)
ok(igual["iguais"], "a mesma semente devolve o mesmo treino")
ok(igual["diferentes"], "outra semente devolve outro treino")

evitou = rodar(
    "const recentes=['prancha','agachamento-livre','flexao-de-braco','burpee-sem-salto'];"
    "const t=M.montar({minutos:20,semente:'ev',evitar:recentes});"
    "const usados=t.blocos.reduce((a,b)=>a.concat(b.exercicios),[]);"
    "console.log(JSON.stringify(usados.filter(i=>recentes.indexOf(i)>=0)));"
)
ok(len(evitou) <= 1, "os exercícios dos últimos treinos perdem a vez", evitou)

# ------------------------------------------------------------------
# 5. O cronômetro
# ------------------------------------------------------------------
print("\nO cronômetro")
caso = treinos[3]           # 20 min, nível 2
passos = caso["passos"]
marcos = []
acumulado = 0
for p in passos:
    marcos.append(acumulado)
    acumulado += p["segundos"]

r = rodar(
    "const t=M.montar({minutos:20,nivel:2,semente:'teste-20-2',"
    "  equipamentos:['halter','elastico','caixa']});"
    "const ps=M.passos(t);"
    "const em=(x)=>{const e=R.em(ps,x); return {i:e.indice, tipo:e.passo?e.passo.tipo:'fim',"
    "  restante:e.restante, lado:e.lado};};"
    "console.log(JSON.stringify({"
    "  total:R.total(ps), inicio:em(0), quase:em(9.5), virada:em(10), fim:em(R.total(ps)),"
    "  pulou:R.pular(ps,3), voltou:R.voltar(ps,R.inicioDoPasso(ps,4)+1),"
    "  repetiu:R.voltar(ps,R.inicioDoPasso(ps,4)+5)}));"
)
ok(r["total"] == acumulado, "o total do relógio é a soma dos passos", (r["total"], acumulado))
ok(r["inicio"]["i"] == 0 and r["inicio"]["restante"] == 10, "em t=0, o primeiro passo inteiro", r["inicio"])
ok(r["quase"]["i"] == 0 and r["quase"]["restante"] == 1, "meio segundo antes ainda mostra 1", r["quase"])
ok(r["virada"]["i"] == 1, "no segundo exato começa o passo seguinte", r["virada"])
ok(r["fim"]["tipo"] == "fim", "no fim, acabou", r["fim"])
ok(r["pulou"] == marcos[1], "pular vai para o começo do próximo passo", (r["pulou"], marcos[1]))
ok(r["voltou"] == marcos[3], "voltar no primeiro segundo vai para o passo anterior",
   (r["voltou"], marcos[3]))
ok(r["repetiu"] == marcos[4], "voltar depois disso repete o passo atual", (r["repetiu"], marcos[4]))

# Um exercício de um lado só parte o tempo no meio e avisa a troca.
uni = rodar(
    "const ps=[{tipo:'trabalho',segundos:40,exercicio:'prancha-lateral',troca:true},"
    "          {tipo:'descanso',segundos:20,titulo:'Descanso'}];"
    "console.log(JSON.stringify({"
    "  antes:R.em(ps,19).lado, depois:R.em(ps,21).lado,"
    "  avisoTroca:R.avisos(ps,19,21).filter(a=>a.tipo==='troca').length,"
    "  contagem:R.avisos(ps,0,40).filter(a=>a.tipo==='conta').length,"
    "  contagemDuasVezes:R.avisos(ps,0,60).filter(a=>a.tipo==='conta').length,"
    "  semRepetir:R.avisos(ps,36.5,37).concat(R.avisos(ps,37,37.5)).filter(a=>a.tipo==='conta').length"
    "}));"
)
ok(uni["antes"] == 1 and uni["depois"] == 2, "o lado troca na metade do tempo", uni)
ok(uni["avisoTroca"] == 1, "e a troca avisa uma vez só", uni["avisoTroca"])
ok(uni["contagem"] == 3, "os 3 segundos finais são avisados", uni["contagem"])
ok(uni["contagemDuasVezes"] == 6, "cada passo tem a sua contagem", uni["contagemDuasVezes"])
ok(uni["semRepetir"] == 1, "quadro partido não repete nem perde o aviso", uni["semRepetir"])

curto = rodar(
    "const ps=[{tipo:'preparar',segundos:3,titulo:'x'}];"
    "console.log(JSON.stringify(R.avisos(ps,0,3).map(a=>a.tipo)));"
)
ok("conta" not in curto, "passo curto não vira chiado de contagem", curto)

# ------------------------------------------------------------------
# 6. Sequência, semana e volume
# ------------------------------------------------------------------
print("\nO histórico")
hoje = datetime.date.today()
d = lambda n: (hoje + datetime.timedelta(days=n)).isoformat()   # noqa: E731


def historico(dias, minutos=20):
    return [{"id": "s%d" % i, "data": d(-n), "quando": 0, "minutos": minutos, "esforco": 14,
             "foco": "corpo-todo", "nivel": 2, "completo": True,
             "exercicios": ["prancha", "agachamento-livre"]}
            for i, n in enumerate(dias)]


def resumo(dias, minutos=20, ref=None):
    return rodar("console.log(JSON.stringify(P.resumo(%s, %s)));"
                 % (json.dumps(historico(dias, minutos)), json.dumps(ref or d(0))))


ok(resumo([1, 2, 3])["sequencia"] == 3,
   "treinou ontem, anteontem e antes: sequência viva sem treinar hoje")
ok(resumo([0, 1, 2])["sequencia"] == 3, "treinou hoje também: três dias")
ok(resumo([2, 3])["sequencia"] == 0, "pulou ontem inteiro: sequência quebrada")
ok(resumo([0])["sequencia"] == 1, "só hoje: um dia")
ok(resumo([])["sequencia"] == 0, "sem histórico, sem sequência")
ok(resumo([0, 1, 5, 6, 7, 8])["recorde"] == 4, "o recorde é a maior sequência de todas",
   resumo([0, 1, 5, 6, 7, 8])["recorde"])

# A semana começa na segunda: um treino de domingo não conta para a semana
# que começou hoje, se hoje for segunda.
segunda = hoje - datetime.timedelta(days=hoje.weekday())
domingo = segunda - datetime.timedelta(days=1)
semana = rodar(
    "console.log(JSON.stringify(P.resumo([{id:'a',data:'%s',minutos:30,esforco:20},"
    "{id:'b',data:'%s',minutos:20,esforco:14}], '%s')));"
    % (domingo.isoformat(), segunda.isoformat(), hoje.isoformat())
)
ok(semana["semana"]["treinos"] == 1, "o treino de domingo fica na semana passada",
   semana["semana"])
ok(semana["semana"]["minutos"] == 20, "e os minutos dele também", semana["semana"])
ok(semana["total"]["treinos"] == 2, "mas os dois contam no total")

dias14 = rodar("console.log(JSON.stringify(P.ultimosDias(%s, 14, '%s')));"
               % (json.dumps(historico([0, 3, 9])), d(0)))
ok(len(dias14) == 14, "o gráfico tem 14 colunas")
ok([x["treinou"] for x in dias14].count(True) == 3, "três delas preenchidas")
ok(dias14[-1]["data"] == d(0), "a última coluna é hoje")

mais = rodar("console.log(JSON.stringify(P.maisTreinados(%s, 3)));"
             % json.dumps(historico([0, 1, 2])))
ok(mais[0]["vezes"] == 3, "os mais treinados contam as sessões", mais)

recentes = rodar("console.log(JSON.stringify(P.recentes(%s, 2)));"
                 % json.dumps(historico([0, 1, 2])))
ok(set(recentes) == {"prancha", "agachamento-livre"}, "os recentes vêm dos últimos treinos", recentes)

# Guardar lixo não pode derrubar o app na próxima abertura.
lixo = rodar(
    "console.log(JSON.stringify(P.normalizar({versao:99,ajustes:{nivel:'abc',minutos:null,"
    "local:'marte',locais:'nao-e-objeto'},historico:[{data:'2026-01-01'},null,{sem:'data'}]})));"
)
ok(lixo["ajustes"]["nivel"] in (1, 2, 3), "nível inválido volta para um valor válido", lixo["ajustes"])
ok(lixo["ajustes"]["local"] == "apartamento", "lugar inexistente volta para apartamento",
   lixo["ajustes"]["local"])
ok(isinstance(lixo["ajustes"]["locais"]["casa"]["equipamentos"], list),
   "lugares estragados voltam ao padrão")
ok(len(lixo["historico"]) == 1, "linha sem data é descartada", lixo["historico"])

# ------------------------------------------------------------------
# 7. Onde a pessoa vai treinar
# ------------------------------------------------------------------
print("\nO lugar do treino")

lugares = rodar(
    "const e=P.estadoNovo();"
    "const ver=(nome)=>P.localAtual(Object.assign({},e.ajustes,{local:nome}));"
    "console.log(JSON.stringify({apartamento:ver('apartamento'), casa:ver('casa'),"
    " academia:ver('academia'), arLivre:ver('ar-livre'), inventado:ver('lua')}));"
)
ok(lugares["apartamento"]["semImpacto"] is True,
   "apartamento já nasce sem barulho para o andar de baixo")
ok(lugares["casa"]["semImpacto"] is False, "em casa dá para pular")
ok(len(lugares["academia"]["equipamentos"]) >= 6,
   "a academia já vem com os pesos", lugares["academia"]["equipamentos"])
ok(set(lugares["arLivre"]["equipamentos"]) <= {"elastico", "corda"},
   "no ar livre, só o que dá para levar", lugares["arLivre"]["equipamentos"])
ok(lugares["inventado"]["nome"] == "apartamento", "lugar desconhecido cai no apartamento")

# O treino montado para cada lugar respeita o lugar.
por_lugar = rodar(
    "const e=P.estadoNovo();"
    "const monta=(nome)=>{const l=P.localAtual(Object.assign({},e.ajustes,{local:nome}));"
    "  const t=M.montar({minutos:30,nivel:3,semente:'lug',equipamentos:l.equipamentos,"
    "    semImpacto:l.semImpacto});"
    "  const ids=t.aquecimento.concat(t.blocos.reduce((a,b)=>a.concat(b.exercicios),[])).concat(t.solta);"
    "  return {impactos:ids.map(i=>X.porId(i).impacto), equip:M.equipamentoNecessario(t)};};"
    "console.log(JSON.stringify({apartamento:monta('apartamento'), academia:monta('academia'),"
    " arLivre:monta('ar-livre')}));"
)
ok("alto" not in por_lugar["apartamento"]["impactos"],
   "o treino de apartamento não tem um salto sequer",
   por_lugar["apartamento"]["impactos"].count("alto"))
ok(por_lugar["apartamento"]["equip"] == [],
   "e não pede equipamento que ninguém disse ter", por_lugar["apartamento"]["equip"])
ok(por_lugar["academia"]["equip"] != [], "o treino de academia usa os pesos de lá")
ok(set(por_lugar["arLivre"]["equip"]) <= {"elastico", "corda"},
   "o do parque só usa o que coube na mochila", por_lugar["arLivre"]["equip"])

# Quem já usava o app tinha o equipamento solto, valendo em todo lugar.
migrado = rodar(
    "console.log(JSON.stringify(P.normalizar({ajustes:{minutos:45,nivel:3,"
    "equipamentos:['halter','elastico'],semImpacto:true},historico:[]}).ajustes));"
)
ok(migrado["locais"]["casa"]["equipamentos"] == ["halter", "elastico"],
   "o halter de quem já usava o app vai para casa", migrado["locais"]["casa"])
ok(migrado["locais"]["apartamento"]["semImpacto"] is True,
   "e o silêncio dele continua valendo no apartamento")
ok(len(migrado["locais"]["academia"]["equipamentos"]) >= 6,
   "a academia dele ganha os pesos que sempre existiram lá")
ok(migrado["minutos"] == 45 and migrado["nivel"] == 3, "o resto dos ajustes sobrevive à migração")

print("\n%d testes, %d falhas" % (len(feitas), len(falhas)))
if falhas:
    print("Falhou: " + ", ".join(falhas))
    sys.exit(1)
