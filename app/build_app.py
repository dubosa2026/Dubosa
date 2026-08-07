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
    html = shell + "\n<script>\n" + core + "\n" + ui + "\n</script>\n"

    SAIDA.write_text(html, encoding="utf-8")
    print(f"gerado {SAIDA.relative_to(RAIZ.parent)} ({len(html.encode()) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
