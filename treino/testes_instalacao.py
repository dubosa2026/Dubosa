"""O que o build promete: um arquivo só, offline, instalável.

    python3 treino/testes_instalacao.py

Este teste não abre navegador. Ele lê o que o `build_app.py` escreveu e
confere as promessas que ninguém percebe quebrar até estar no celular, sem
sinal, no meio do treino:

- o HTML não pede NADA à rede (sem CDN, sem fonte externa, sem imagem);
- as fontes estão mesmo embutidas;
- o manifesto e o service worker apontam para arquivos que existem;
- o cache do service worker muda de nome quando o app muda — senão a
  correção fica presa no aparelho.
"""
import json
import re
import struct
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
ARQUIVO = RAIZ / "circuito.html"
DIST = RAIZ / "dist"
DOCS = RAIZ.parent / "docs"

falhas = []
feitas = []


def ok(cond, nome, extra=""):
    feitas.append(nome)
    print(("  ok    " if cond else "  FALHA ") + nome + ("" if cond else "  -> " + str(extra)))
    if not cond:
        falhas.append(nome)


if not ARQUIVO.exists() or not (DIST / "index.html").exists():
    print("Rode antes: python3 treino/build_app.py")
    sys.exit(1)

unico = ARQUIVO.read_text(encoding="utf-8")
dist = (DIST / "index.html").read_text(encoding="utf-8")


def so_marcacao(texto):
    """O HTML sem o bloco de script.

    Procurar `href="..."` no arquivo inteiro encontra também o HTML que o
    app monta dentro do JavaScript — inclusive o link de baixar o app, que
    é texto dentro de uma string e não uma requisição. Sem tirar o script,
    o teste de "não pede nada à rede" acusava o próprio código."""
    return re.sub(r"<script>.*?</script>", "", texto, flags=re.S)

print("\nUm arquivo só")
ok(len(unico) > 150_000, "o app tem tamanho de app", len(unico))
ok(unico.count("<script>") == 1, "todo o JavaScript num bloco só", unico.count("<script>"))
ok("__ARCHIVO__" not in unico and "data:font/woff2;base64," in unico,
   "as fontes entraram embutidas")
ok(unico.count("data:font/woff2;base64,") == 4, "as quatro fontes, nenhuma a menos",
   unico.count("data:font/woff2;base64,"))

# Qualquer coisa que o navegador iria buscar na rede.
externos = re.findall(r'(?:src|href)\s*=\s*"(?!data:|#)([^"]+)"', so_marcacao(unico))
ok(not externos, "o arquivo único não pede nada à rede", externos)

print("\nOs módulos, todos lá dentro")
for modulo in ["formato.js", "exercicios.js", "bonecos.js", "montador.js", "relogio.js",
               "progresso.js", "corpo.js", "ui.js"]:
    ok("/* ==== %s ==== */" % modulo in unico, "%s entrou no pacote" % modulo)
ok(unico.index("/* ==== formato.js ==== */") < unico.index("/* ==== ui.js ==== */"),
   "e na ordem de dependência")

print("\nA versão publicada")
externos_dist = re.findall(r'(?:src|href)\s*=\s*"(?!data:|#)([^"]+)"', so_marcacao(dist))
permitidos = {"manifest.webmanifest", "apple-touch-icon.png"}
ok(set(externos_dist) <= permitidos, "a versão publicada só busca o manifesto e o ícone",
   set(externos_dist) - permitidos)
for nome in permitidos:
    ok((DIST / nome).exists(), "%s está na pasta" % nome)

manifesto = json.loads((DIST / "manifest.webmanifest").read_text(encoding="utf-8"))
ok(manifesto["display"] == "standalone", "abre sem barra de navegador")
ok(manifesto["lang"] == "pt-BR", "o manifesto está em português")
for icone in manifesto["icons"]:
    ok((DIST / icone["src"]).exists(), "o ícone %s existe" % icone["src"])
ok(any(i.get("purpose") == "maskable" for i in manifesto["icons"]),
   "tem ícone maskable, senão o Android recorta o desenho")

print("\nOs ícones")


def tamanho_png(caminho):
    dados = caminho.read_bytes()
    assert dados[:8] == b"\x89PNG\r\n\x1a\n", "não é PNG"
    largura, altura = struct.unpack(">II", dados[16:24])
    return largura, altura, dados[24]        # largura, altura, bits por canal


for icone in manifesto["icons"]:
    esperado = int(icone["sizes"].split("x")[0])
    largura, altura, bits = tamanho_png(DIST / icone["src"])
    ok((largura, altura) == (esperado, esperado),
       "%s tem %d x %d de verdade" % (icone["src"], esperado, esperado), (largura, altura))
ok(tamanho_png(DIST / "apple-touch-icon.png")[0] == 180, "o ícone do iPhone tem 180 px")

print("\nO service worker")
sw = (DIST / "sw.js").read_text(encoding="utf-8")
versao = re.search(r'name="circuito-versao" content="([^"]+)"', dist).group(1)
ok(versao in sw, "o cache leva a versão do app no nome", versao)
ok("__VERSAO__" not in sw, "o marcador foi mesmo substituído")
ok("navigate" in sw and "'reload'" in sw,
   "a página vem da rede primeiro, senão a correção não chega ao celular")
for arquivo in re.findall(r"'\./([^']+)'", sw):
    if arquivo:
        ok((DIST / arquivo).exists(), "o cache pede %s, que existe" % arquivo)

print("\nInstalar e baixar")
ok('<meta name="circuito-arquivo"' in so_marcacao(dist),
   "a versão publicada sabe onde está o arquivo para baixar")
ok('<meta name="circuito-arquivo"' not in so_marcacao(unico),
   "e a versão de arquivo único não oferece baixar o que a pessoa já tem")
ok((DIST / "circuito.html").exists(), "a cópia de arquivo único viaja junto do site")
ok((DIST / "circuito.html").read_text(encoding="utf-8") == unico,
   "e é idêntica ao arquivo único")
ok("beforeinstallprompt" in unico, "o app escuta o convite de instalação do Android")
ok("display-mode: standalone" in unico, "e sabe quando já está instalado")

print("\nA cópia para o GitHub Pages")
ok((DOCS / "index.html").exists(), "docs/ existe, que é de onde o GitHub Pages publica")
ok((DOCS / "index.html").read_text(encoding="utf-8") == dist,
   "e tem exatamente a mesma página que treino/dist/")
ok((DOCS / ".nojekyll").exists(), "com o .nojekyll que desliga o Jekyll")
for nome in ["manifest.webmanifest", "sw.js", "icone-192.png", "icone-512.png",
             "icone-maskable-512.png", "apple-touch-icon.png", "circuito.html"]:
    ok((DOCS / nome).exists(), "docs/ leva %s junto" % nome)

print("\nA versão muda quando o app muda")
sys.path.insert(0, str(RAIZ))
import build_app                                                    # noqa: E402

antes = build_app.versao_das_fontes()
alvo = RAIZ / "src" / "formato.js"
original = alvo.read_text(encoding="utf-8")
try:
    alvo.write_text(original + "\n/* teste */\n", encoding="utf-8")
    ok(build_app.versao_das_fontes() != antes, "mexer num módulo muda a versão")
finally:
    alvo.write_text(original, encoding="utf-8")
ok(build_app.versao_das_fontes() == antes, "e desfazer devolve a versão de antes")

# O ícone também é o app: o service worker o guarda em cache, então trocar
# o desenho sem trocar a versão deixaria o ícone velho preso no aparelho.
icone = RAIZ / "src" / "icones" / "icone-192.png"
original_icone = icone.read_bytes()
try:
    icone.write_bytes(original_icone[:-1])
    ok(build_app.versao_das_fontes() != antes, "mexer num ícone também muda a versão")
finally:
    icone.write_bytes(original_icone)
ok(build_app.versao_das_fontes() == antes, "e desfazer devolve a versão de antes, de novo")

print("\n%d testes, %d falhas" % (len(feitas), len(falhas)))
if falhas:
    print("Falhou: " + ", ".join(falhas))
    sys.exit(1)
