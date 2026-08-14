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

# O conteudo de app_shell.html e so o corpo da pagina. Sem este esqueleto o
# navegador cai em quirks mode e, pior, sem <meta charset> os acentos podem
# sair trocados e sem <meta viewport> o celular renderiza como desktop.
ESQUELETO = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex, nofollow">
{cabeca}
</head>
<body>
{corpo}
</body>
</html>
"""

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


if __name__ == "__main__":
    main()
