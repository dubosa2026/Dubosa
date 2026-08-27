"""A matematica das projecoes, conferida por fora.

    python3 app/testes_nucleo.py

Roda os modulos do app no node (eles sao JS puro, sem navegador) e compara
cada resultado com a mesma conta refeita aqui em Python, na mao. Se as duas
contas concordam, o numero que aparece na tela nao e um acidente de
implementacao.

E o unico teste do repositorio que checa dinheiro contra dinheiro. Os outros
checam se a tela abre; este checa se a tela esta falando a verdade.
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


def perto(a, b, tol=0.02):
    return abs(float(a) - float(b)) <= tol


def rodar(js):
    """Executa um trecho de JS com os modulos do app carregados."""
    programa = (
        "const F=require('%s/formato.js');"
        "const N=require('%s/nucleo.js');"
        "const V=require('%s/voz.js');"
        "const C=require('%s/conselhos.js');" % (SRC, SRC, SRC, SRC)
    ) + js
    r = subprocess.run(["node", "-e", programa], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit(1)
    return json.loads(r.stdout)


hoje = datetime.date.today()
d = lambda n: (hoje + datetime.timedelta(days=n)).isoformat()   # noqa: E731

# ------------------------------------------------------------------
# Um perfil simples e inteiramente calculavel na mao.
# ------------------------------------------------------------------
ESTADO = {
    "versao": 1,
    "saldo": {"valor": 2000.0, "data": d(0), "definidoEm": 0},
    "lancamentos": [
        {"id": "v%d" % i, "data": d(-i), "valor": 40.0, "tipo": "saida",
         "categoria": "mercado", "criadoEm": 1}
        for i in range(1, 31)          # 30 dias, R$ 40/dia, nada hoje
    ],
    "fixos": [
        {"id": "sal", "nome": "Salário", "valor": 5000.0, "tipo": "entrada",
         "ciclo": "mensal", "dia": 5, "categoria": "salario", "ativo": True},
        {"id": "alu", "nome": "Aluguel", "valor": 1500.0, "tipo": "saida",
         "ciclo": "mensal", "dia": 10, "categoria": "moradia", "ativo": True},
    ],
    "dividas": [],
    "ajustes": {"reserva": 0, "reservaMeses": 3, "taxaAno": None,
                "janelaMedia": 30, "falar": True, "pin": ""},
}

E = json.dumps(ESTADO)

print("\n== saldo ==")
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify({s:N.saldoEm(e)}));" % E)
ok(perto(r["s"], 2000), "saldo informado hoje vale hoje (gasto de ontem já estava no extrato)", r)

# Um lancamento de hoje, criado depois do saldo, precisa descontar.
comHoje = json.loads(E)
comHoje["lancamentos"].insert(0, {"id": "h", "data": d(0), "valor": 60.0,
                                  "tipo": "saida", "categoria": "comida", "criadoEm": 9999999999999})
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify({s:N.saldoEm(e)}));" % json.dumps(comHoje))
ok(perto(r["s"], 1940), "gasto lançado depois do saldo desconta", r)

print("\n== média do gasto variável ==")
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.mediaVariavel(e)));" % E)
# A janela sao os ultimos 30 dias contando hoje. Dentro dela ha 29 dias com
# gasto (o de 30 dias atras ficou de fora) e hoje, que ainda nao teve gasto.
# Logo: 29 x 40 / 30 = 38,67. Dia sem gastar puxa a media para baixo — e e
# isso mesmo que se quer, senao a projecao ficaria pessimista de proposito.
ok(perto(r["media"], 29 * 40 / 30), "média = o gasto da janela dividido pelos dias da janela", r)
ok(r["lancamentos"] == 29 and r["dias"] == 30, "29 dias com gasto em 30 dias de janela", r)
ok(r["confianca"] == "alta", "30 dias de histórico é confiança alta", r["confianca"])

curto = json.loads(E)
curto["lancamentos"] = curto["lancamentos"][:2]
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.mediaVariavel(e)));" % json.dumps(curto))
ok(r["confianca"] == "baixa", "dois dias de histórico é confiança baixa", r["confianca"])

print("\n== contas fixas viram calendário ==")
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.ocorrencias(e,'%s','%s')));"
          % (E, d(1), d(60)))
salarios = [o for o in r if o["fixoId"] == "sal"]
alugueis = [o for o in r if o["fixoId"] == "alu"]
ok(1 <= len(salarios) <= 3, "o salário aparece uma vez por mês nos próximos 60 dias", len(salarios))
ok(all(o["data"][8:10] == "05" for o in salarios), "sempre no dia 5", [o["data"] for o in salarios])
ok(all(o["data"][8:10] == "10" for o in alugueis), "o aluguel sempre no dia 10", [o["data"] for o in alugueis])

# Dia 31 num mes de 30 tem de cair no ultimo dia, nao sumir.
trintaeum = json.loads(E)
trintaeum["fixos"] = [{"id": "x", "nome": "Cartão", "valor": 100.0, "tipo": "saida",
                       "ciclo": "mensal", "dia": 31, "categoria": "divida", "ativo": True}]
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.ocorrencias(e,'2026-04-01','2026-04-30')));"
          % json.dumps(trintaeum))
ok(len(r) == 1 and r[0]["data"] == "2026-04-30", "dia 31 em abril cai no dia 30", r)

# Conta ja paga nao pode ser projetada de novo.
paga = json.loads(E)
paga["lancamentos"].insert(0, {"id": "p", "data": d(0), "valor": 1500.0, "tipo": "saida",
                               "categoria": "moradia", "fixoId": "alu", "criadoEm": 1})
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.ocorrencias(e,'%s','%s')));"
          % (json.dumps(paga), d(0), d(20)))
ok(not [o for o in r if o["fixoId"] == "alu" and o["data"][:7] == d(0)[:7]],
   "aluguel já lançado no mês não é projetado outra vez", r)

print("\n== projeção ==")
# Sete dias adiante, sem nenhuma conta fixa no caminho: 2000 - 7x40.
semFixos = json.loads(E)
semFixos["fixos"] = []
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.projetar(e,'%s')));"
          % (json.dumps(semFixos), d(7)))
media = r["mediaDia"]
ok(perto(r["saldoFinal"], 2000 - 8 * media),
   "projeção de 7 dias = saldo − 8 dias de média (hoje conta, e ainda não teve gasto)",
   (r["saldoFinal"], 2000 - 8 * media))
ok(perto(r["saidasVariaveis"], 8 * media) and r["entradas"] == 0, "a decomposição bate", r["saidasVariaveis"])
ok(len(r["serie"]) == 8, "a série tem um ponto por dia", len(r["serie"]))
datas = [p["data"] for p in r["serie"]]
ok(len(set(datas)) == len(datas), "nenhuma data repetida na série (senão o gráfico cria degrau falso)", datas)
ok(datas[0] == d(0) and datas[-1] == d(7), "a série vai de hoje até o fim do horizonte", (datas[0], datas[-1]))

# Com o salario e o aluguel do mes que vem, a conta muda de forma previsivel.
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.projetar(e,'%s')));" % (E, d(45)))
esperado = 2000 - 46 * r["mediaDia"]
prog = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.ocorrencias(e,'%s','%s')));"
             % (E, d(1), d(45)))
for o in prog:
    esperado += o["valor"] if o["tipo"] == "entrada" else -o["valor"]
ok(perto(r["saldoFinal"], esperado),
   "projeção de 45 dias = saldo − média×dias + entradas − saídas fixas", (r["saldoFinal"], esperado))

# Saldo que fura o chao precisa ser avisado, e na data certa.
furado = json.loads(json.dumps(semFixos))
furado["saldo"]["valor"] = 100.0
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.projetar(e,'%s')));"
          % (json.dumps(furado), d(30)))
# 100 reais, gastando ~38,67 por dia: fim de hoje 61, amanha 23, depois furou.
ok(r["zeraEm"] == d(2), "avisa o dia em que o saldo fura o zero", (r["zeraEm"], d(2)))

print("\n== teto do dia ==")
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.limiteDoDia(e)));" % E)
prox = rodar("const e=N.normalizar(%s); const l=N.limiteDoDia(e);"
             "console.log(JSON.stringify({ate:l.ate,dias:l.diasRestantes,entram:l.entram,saem:l.saem}));" % E)
esperado = (2000 + prox["entram"] - prox["saem"]) / prox["dias"]
ok(perto(r["limite"], esperado), "o teto é o que sobra dividido pelos dias até a próxima entrada",
   (r["limite"], esperado))
ok(r["proxima"] and r["proxima"]["tipo"] == "entrada", "a janela é fechada pela próxima entrada", r.get("proxima"))

# A reserva sai da conta antes de virar teto.
comReserva = json.loads(E)
comReserva["ajustes"]["reserva"] = 500.0
r2 = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(N.limiteDoDia(e)));" % json.dumps(comReserva))
ok(perto(r2["limite"], r["limite"] - 500 / r["diasRestantes"]),
   "a reserva é descontada antes de dividir pelos dias", (r["limite"], r2["limite"]))

print("\n== render (juros compostos) ==")
r = rodar("console.log(JSON.stringify(N.simularRendimento(500,0.12,12,0)));")
i = (1.12) ** (1 / 12) - 1
mao = 0.0
for _ in range(12):
    mao = mao * (1 + i) + 500
ok(perto(r["saldo"], mao, 0.05), "12 aportes de 500 a 12% ao ano", (r["saldo"], round(mao, 2)))
ok(perto(r["aportado"], 6000), "o aportado é só a soma dos depósitos", r["aportado"])
ok(perto(r["juros"], mao - 6000, 0.05), "o juro é a diferença", r["juros"])

vazio = rodar("console.log(JSON.stringify({r:N.simularRendimento(500,null,12,0)}));")
ok(vazio["r"] is None, "sem taxa informada, NÃO simula nada (não inventa taxa de mercado)")

print("\n== dívidas ==")
r = rodar("console.log(JSON.stringify(N.planoDividas("
          "[{id:'a',nome:'Cartão',saldo:5000,jurosMes:0.14,parcela:600},"
          "{id:'b',nome:'Consignado',saldo:9000,jurosMes:0.02,parcela:400}], 0)));")
ok(r["alvo"]["nome"] == "Cartão", "ataca primeiro o juro maior, não o saldo maior", r["alvo"])
ok(perto(r["jurosMes"], 5000 * 0.14 + 9000 * 0.02), "soma o juro de todas por mês", r["jurosMes"])
ok(r["ordem"][0]["nome"] == "Cartão" and r["ordem"][1]["nome"] == "Consignado", "a ordem é por juro")

r = rodar("console.log(JSON.stringify(N.planoDividas("
          "[{id:'a',nome:'Rotativo',saldo:5000,jurosMes:0.15,parcela:100}], 0)));")
ok(r["naoFecha"] is True, "avisa quando a parcela não cobre nem o juro", r)

print("\n== conselhos ==")
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(C.gerar(e).map(c=>c.id)));" % E)
ok("ano" in r, "sempre mostra para onde o ano vai", r)

# O saldo tem de ser MENOR que a media diaria, senao o teste depende do dia
# do mes em que roda: com R$ 200 e média de ~R$ 39, o mês fura no dia 26 e
# fecha de pé no dia 27, quando sobram menos dias. Abaixo da média, ele fura
# hoje — em qualquer dia do calendário.
sufoco = json.loads(E)
sufoco["saldo"]["valor"] = 20.0
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(C.gerar(e)));" % json.dumps(sufoco))
negativo = [c for c in r if c["id"] == "negativo"]
ok(negativo, "com saldo furando, o primeiro conselho é o buraco", [c["id"] for c in r])
if negativo:
    plano = negativo[0].get("plano")
    ok(plano and plano["linhas"], "o conselho vem com o plano de corte, categoria a categoria", plano)
    ok(all(l["corte"] <= l["gasta"] * l["teto"] + 0.01 for l in plano["linhas"]),
       "nenhuma categoria passa do teto dela (40% no supérfluo, 20% em mercado/transporte)",
       plano["linhas"] if plano else None)
    ok(perto(plano["total"], plano["falta"], 0.5),
       "o corte proposto fecha exatamente o buraco, sem exagerar", (plano["total"], plano["falta"]))

semTaxa = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(C.gerar(e).map(c=>c.id)));"
                % json.dumps({**ESTADO, "saldo": {"valor": 30000.0, "data": d(0), "definidoEm": 0}}))
ok("taxa" in semTaxa, "sobrando dinheiro e sem taxa informada, pede a taxa em vez de chutar", semTaxa)

print("\n== o retrato que vai para a IA ==")
r = rodar("const e=N.normalizar(%s); console.log(JSON.stringify(C.retrato(e)));" % json.dumps(comHoje))
bruto = json.dumps(r, ensure_ascii=False)
ok("descricao" not in bruto and "descrição" not in bruto, "o retrato não leva descrição de lançamento")
ok(not any(k in bruto for k in [d(0), d(-1)]), "o retrato não leva data de gasto", bruto[:200])
ok("saldo" in r and "gastos_30_dias" in r, "mas leva os números que importam", list(r)[:6])

if falhas:
    print("\n%d verificações, %d falhas: %s" % (len(feitas), len(falhas), ", ".join(falhas)))
    sys.exit(1)
print("\n%d verificações, nenhuma falha." % len(feitas))
