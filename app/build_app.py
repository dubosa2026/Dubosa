"""Junta os fontes em app/src/ num unico arquivo HTML autocontido.

    python3 app/build_app.py

As fontes .woff2 entram embutidas em base64, entao o HTML gerado abre
offline, sem CDN e sem instalar nada.
"""

import base64
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
SRC = RAIZ / "src"
FONTES = SRC / "fonts"
SAIDA = RAIZ / "belenergy-distribuicao.html"
SAIDA_WEB = RAIZ / "dist" / "index.html"
SAIDA_CARTEIRA = RAIZ / "dist" / "c" / "index.html"

# O sol da marca, embutido como data URI. Sem ele o navegador pede
# /favicon.ico em toda visita, leva 404 e escreve um erro no console -- e a
# aba do vendedor, que costuma ficar aberta o dia todo, fica sem identidade.
FAVICON = (
    "data:image/svg+xml,"
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
    "%3Crect width='32' height='32' rx='6' fill='%230A0A0B'/%3E"
    "%3Ccircle cx='16' cy='16' r='6' fill='%23FFC72C'/%3E"
    "%3Cg stroke='%23FFC72C' stroke-width='2.4' stroke-linecap='round'%3E"
    "%3Cline x1='16' y1='3' x2='16' y2='6.5'/%3E%3Cline x1='16' y1='25.5' x2='16' y2='29'/%3E"
    "%3Cline x1='3' y1='16' x2='6.5' y2='16'/%3E%3Cline x1='25.5' y1='16' x2='29' y2='16'/%3E"
    "%3Cline x1='6.8' y1='6.8' x2='9.3' y2='9.3'/%3E%3Cline x1='22.7' y1='22.7' x2='25.2' y2='25.2'/%3E"
    "%3Cline x1='6.8' y1='25.2' x2='9.3' y2='22.7'/%3E%3Cline x1='22.7' y1='9.3' x2='25.2' y2='6.8'/%3E"
    "%3C/g%3E%3C/svg%3E"
)

# O conteudo de app_shell.html e so o corpo da pagina. Sem este esqueleto o
# navegador cai em quirks mode e, pior, sem <meta charset> os acentos podem
# sair trocados e sem <meta viewport> o celular renderiza como desktop.
ESQUELETO = ("""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="__FAVICON__">
{cabeca}
</head>
<body>
{corpo}
</body>
</html>
""".replace("__FAVICON__", FAVICON))

SUBSTITUICOES = {
    "__ARCHIVO__": "archivo-var.woff2",
    "__PLEXSANS__": "plexsans-var.woff2",
    "__PLEXMONO400__": "plexmono-400.woff2",
    "__PLEXMONO600__": "plexmono-600.woff2",
}


def b64(nome: str) -> str:
    return base64.b64encode((FONTES / nome).read_bytes()).decode("ascii")


def main() -> None:
    shell = (SRC / "app_shell.html").read_text(encoding="utf-8")
    for marcador, fonte in SUBSTITUICOES.items():
        shell = shell.replace(marcador, b64(fonte))

    core = (SRC / "app_core.js").read_text(encoding="utf-8")
    ui = (SRC / "app_ui.js").read_text(encoding="utf-8")

    # <title> e <style> vao para o <head>; o resto e corpo da pagina.
    corte = shell.index("</style>") + len("</style>")
    cabeca, corpo = shell[:corte], shell[corte:]

    html = ESQUELETO.format(
        cabeca=cabeca,
        corpo=corpo + "\n<script>\n" + core + "\n" + ui + "\n</script>",
    )

    SAIDA.write_text(html, encoding="utf-8")
    SAIDA_WEB.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_WEB.write_text(html, encoding="utf-8")

    tamanho = len(html.encode()) / 1024
    print(f"gerado {SAIDA.relative_to(RAIZ.parent)} ({tamanho:.0f} KB)")
    print(f"gerado {SAIDA_WEB.relative_to(RAIZ.parent)} (mesmo conteudo, para o Netlify)")

    # Pagina do vendedor: mesmo visual (reaproveita o <style> do app),
    # corpo e script proprios.
    corpo_vendedor = (SRC / "carteira_body.html").read_text(encoding="utf-8")
    # roteiro.js define o objeto Roteiro que carteira.js usa ao desenhar a
    # pagina, entao vem antes.
    js_vendedor = (
        (SRC / "roteiro.js").read_text(encoding="utf-8")
        + "\n"
        + (SRC / "carteira.js").read_text(encoding="utf-8")
    )
    cabeca_vendedor = cabeca.replace(
        "<title>BelEnergy — Distribuição de Carteira</title>",
        "<title>Minha carteira — BelEnergy</title>",
        1,
    )
    html_vendedor = ESQUELETO.format(
        cabeca=cabeca_vendedor,
        corpo=corpo_vendedor + "\n<script>\n" + js_vendedor + "\n</script>",
    )
    SAIDA_CARTEIRA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_CARTEIRA.write_text(html_vendedor, encoding="utf-8")
    print(
        f"gerado {SAIDA_CARTEIRA.relative_to(RAIZ.parent)} "
        f"({len(html_vendedor.encode()) / 1024:.0f} KB, pagina do vendedor)"
    )


if __name__ == "__main__":
    main()
