"""Agendamento de retorno e o lembrete de 30 minutos por e-mail.

O que precisa ser verdade:

  1. O compromisso e do VENDEDOR, como a anotacao. O token do outro nao le
     nem escreve nada aqui.
  2. O lembrete sai UMA vez. Se duas execucoes da tarefa se cruzarem, so uma
     marca `avisadoEm` -- tres e-mails iguais na caixa de entrada seria pior
     que nenhum.
  3. Compromisso que ja passou NAO vira e-mail atrasado. Avisar as 15h de uma
     ligacao das 14h nao ajuda; ele so e marcado para nao voltar.
  4. Sem chave de e-mail o agendamento continua salvo e a tela avisa que nao
     sai lembrete, em vez de prometer um e-mail que nunca chegaria.

O envio e interceptado por um Brevo falso (brevo_falso.mjs), que guarda o
que teria saido em vez de mandar para a internet.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

PORTA = os.environ.get("PORTA_AGENDA", "8897")
BASE = f"http://localhost:{PORTA}"
SENHA = "senha-de-teste"
SANDBOX = os.environ.get("SANDBOX")
CAIXA = "/tmp/claude-0/-home-user-Dubosa/2865c67b-73f7-5f69-865e-8196845b571f/scratchpad/caixa.json"
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


def tarefa(nome):
    """Dispara uma funcao agendada pelo servidor de teste."""
    with urllib.request.urlopen(BASE + "/__tarefa/" + nome) as r:
        return r.read().decode()


def caixa():
    try:
        with open(CAIXA, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def limpar_caixa():
    try:
        os.remove(CAIXA)
    except FileNotFoundError:
        pass


def daqui(minutos):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutos)).isoformat()


def Date_ms(iso):
    return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp() * 1000


if not SANDBOX:
    print("defina SANDBOX com a pasta montada como no README.md")
    raise SystemExit(2)

limpar_caixa()
servidor = subprocess.Popen(
    ["node", "servidor.mjs"], cwd=SANDBOX,
    stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    env={**os.environ, "ADMIN_TOKEN": SENHA, "PORTA": PORTA,
         "BREVO_API_KEY": "chave-de-teste",
         "EMAIL_REMETENTE": "carteira@belenergy.com.br",
         "EMAIL_GESTOR": "gestor@belenergy.com.br",
         "CAIXA_FALSA": CAIXA})
try:
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/", timeout=1)
            break
        except Exception:
            time.sleep(0.25)

    SUF = "-ag-" + str(int(time.time()))
    A, B = "ANA AGENDA" + SUF, "BENTO AGENDA" + SUF
    COLUNAS = ["Integrador (CLI - Nome)", "Cidade", "UF", "Telefone"]

    def publicar(vend, email):
        return api("/api/publicar", {
            "vendedor": vend, "uf": "PA", "modo": "normal", "email": email,
            "rotulo": "Distribuição de carteira", "colunas": COLUNAS,
            "linhas": [{"Integrador (CLI - Nome)": "CLI-0000000101 - SOLAR NORTE",
                        "Cidade": "BELÉM", "UF": "PA", "Telefone": "(91) 98888-0001"}],
        }, admin=True)

    print("1. publicando com e-mail cadastrado")
    _, ra = publicar(A, "ana@belenergy.com.br")
    _, rb = publicar(B, "bento@belenergy.com.br")
    tokA, tokB = ra["token"], rb["token"]
    ok(bool(tokA and tokB), "os dois links existem")

    print("\n2. agendar")
    st, r = api("/api/agenda", {"token": tokA, "acao": "somar", "cliente": "CLI101",
                                "nome": "CLI-0000000101 - SOLAR NORTE",
                                "quando": daqui(25), "fuso": "America/Belem",
                                "obs": "Retornar com a proposta do kit."})
    ok(st == 200, "agendou", (st, r))
    ok(len(r["agenda"]) == 1, "aparece na lista dele", r.get("agenda"))
    ok(r["avisa"] is True, "e a tela promete o lembrete, porque há e-mail", r.get("avisa"))

    st, _ = api("/api/agenda", {"token": tokA, "acao": "somar", "cliente": "CLI101",
                                "quando": daqui(-30)})
    ok(st == 400, "hora no passado é recusada", st)
    st, _ = api("/api/agenda", {"token": tokA, "acao": "somar", "cliente": "CLI101",
                                "quando": daqui(60 * 24 * 400)})
    ok(st == 400, "e um ano e meio à frente também", st)

    print("\n3. o compromisso é do vendedor, não do cliente")
    _, rb2 = api("/api/agenda", {"token": tokB, "acao": "listar"})
    ok(rb2["agenda"] == [], "o Bento não vê o compromisso da Ana", rb2)
    st, _ = api("/api/agenda", {"token": "0" * 48, "acao": "listar"})
    ok(st == 404, "token inexistente é recusado", st)

    print("\n4. o lembrete de 30 minutos")
    limpar_caixa()
    print("    ", tarefa("lembretes"))
    saiu = caixa()
    ok(len(saiu) == 1, "saiu um e-mail", [e["assunto"] for e in saiu])
    ok(saiu and saiu[0]["para"] == "ana@belenergy.com.br", "para a Ana",
       saiu[0]["para"] if saiu else None)
    ok(saiu and "SOLAR NORTE" in saiu[0]["assunto"], "com o cliente no assunto",
       saiu[0]["assunto"] if saiu else None)
    ok(saiu and "kit" in saiu[0]["html"], "e a observação no corpo")

    print("\n5. NÃO AVISA DUAS VEZES")
    limpar_caixa()
    tarefa("lembretes")
    tarefa("lembretes")
    ok(caixa() == [], "rodar de novo não manda nada", caixa())

    print("\n6. compromisso vencido não vira e-mail atrasado")
    limpar_caixa()
    # Escreve direto no blob: um compromisso cuja hora ja passou e que nunca
    # foi avisado -- o caso de o site ter ficado fora do ar.
    with urllib.request.urlopen(urllib.request.Request(
            BASE + "/__semear", method="POST",
            data=json.dumps({"vendedor": A, "quando": daqui(-45)}).encode(),
            headers={"content-type": "application/json"})) as r:
        r.read()
    print("    ", tarefa("lembretes"))
    ok(caixa() == [], "nenhum e-mail para hora que já passou", caixa())
    _, dep = api("/api/agenda", {"token": tokA, "acao": "listar"})
    vencido = [a for a in dep["agenda"] if a["id"] == "f" * 16]
    ok(vencido and vencido[0].get("avisadoEm"),
       "mas ele fica marcado, para não ser reavaliado a cada 5 minutos",
       vencido[0] if vencido else dep["agenda"])
    ok(vencido and vencido[0].get("avisoPerdido") is True,
       "e marcado como aviso perdido, não como aviso enviado",
       vencido[0] if vencido else None)

    print("\n6b. vendedor sem e-mail cadastrado")
    C = "CARLA SEM MAIL" + SUF
    _, rc = publicar(C, "")
    _, r = api("/api/agenda", {"token": rc["token"], "acao": "somar",
                               "cliente": "CLI101", "quando": daqui(25)})
    ok(r["avisa"] is False, "a tela não promete lembrete que não vai sair", r.get("avisa"))
    ok(len(r["agenda"]) == 1, "mas o compromisso é salvo do mesmo jeito", r.get("agenda"))
    limpar_caixa()
    tarefa("lembretes")
    ok(not any(e["para"] == "" for e in caixa()), "e nada é enviado para endereço vazio",
       caixa())

    print("\n7. resumo diário do gestor")
    limpar_caixa()
    api("/api/agenda", {"token": tokB, "acao": "somar", "cliente": "CLI101",
                        "nome": "CLI-0000000101 - SOLAR NORTE", "quando": daqui(90)})
    print("    ", tarefa("resumo"))
    res = caixa()
    ok(len(res) == 1, "um e-mail só", len(res))
    ok(res and res[0]["para"] == "gestor@belenergy.com.br", "para o gestor",
       res[0]["para"] if res else None)
    ok(res and "ANA AGENDA" in res[0]["html"].upper(), "com a Ana")
    ok(res and "BENTO AGENDA" in res[0]["html"].upper(), "e com o Bento")

    print("\n7b. o gestor vê os agendamentos no painel dele")
    st, cad = api("/api/caderno", {"vendedores": []}, admin=True)
    ok(st == 200, "o caderno responde", st)
    comAgenda = [i for i in cad["itens"] if i.get("agenda")]
    ok(comAgenda, "traz agendamento junto com as anotações",
       [(i["vendedor"], len(i.get("agenda", []))) for i in cad["itens"]][:6])
    ok(any("SOLAR NORTE" in (a.get("nome") or "")
           for i in comAgenda for a in i["agenda"]),
       "com o nome do cliente resolvido",
       comAgenda[0]["agenda"][0] if comAgenda else None)
    ok(all(Date_ms(a["quando"]) > time.time() * 1000
           for i in comAgenda for a in i["agenda"]),
       "e só o que ainda está por vir")

    print("\n8. concluir e cancelar")
    _, r = api("/api/agenda", {"token": tokB, "acao": "listar"})
    idb = r["agenda"][0]["id"]
    _, r = api("/api/agenda", {"token": tokB, "acao": "concluir", "id": idb})
    ok(r["agenda"] == [], "'já liguei' tira da lista", r)
    st, _ = api("/api/agenda", {"token": tokB, "acao": "apagar", "id": "0" * 16})
    ok(st == 404, "apagar o que não existe é recusado", st)
finally:
    servidor.terminate()

print("\n" + (f"{len(falhas)} FALHA(S): {falhas}" if falhas else "Todos os testes passaram."))
sys.exit(1 if falhas else 0)
