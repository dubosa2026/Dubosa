"""Gera os icones PNG do app a partir do desenho da bussola.

    python3 app/gerar_icones.py

RODA A MAO, so quando o desenho do icone mudar — e precisa do Playwright,
que o Netlify nao tem. Os PNGs ficam versionados em `app/src/icones/` e o
build so os copia.

Por que PNG, se o SVG e menor e mais bonito: para o Chrome do Android
oferecer "Instalar aplicativo" (e nao um atalho de navegador), o manifesto
precisa de um icone PNG de 192px ou mais. O iPhone, por sua vez, so aceita
PNG no `apple-touch-icon`. Sem esses dois arquivos o app entra na tela de
inicio como link, abre com a barra do navegador em cima e perde a cara de
aplicativo — que e justamente o que se quer aqui.

O icone "maskable" e o mesmo desenho com folga em volta: o Android recorta o
icone no formato do aparelho (circulo, quadrado arredondado, gota), e sem a
folga a agulha da bussola sai cortada.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

SAIDA = Path(__file__).resolve().parent / "src" / "icones"

# O desenho, em coordenadas de 0 a 32. `escala` encolhe a bussola dentro do
# quadro para o recorte do Android nao comer a agulha.
def desenho(escala=1.0, cantos=7):
    d = 16 - 16 * escala
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
  <rect width="32" height="32" rx="{cantos}" fill="#0A0A0B"/>
  <g transform="translate({d},{d}) scale({escala})">
    <circle cx="16" cy="16" r="11" fill="none" stroke="#3A3A43" stroke-width="2"/>
    <path d="M22 10 L13.5 13 L10 22 L18.5 19 Z" fill="#FFC72C"/>
    <circle cx="16" cy="16" r="1.6" fill="#0A0A0B"/>
  </g>
</svg>"""


ICONES = [
    ("icone-192.png", 192, 1.0, 34),
    ("icone-512.png", 512, 1.0, 90),
    # Maskable: fundo inteiro, sem cantos arredondados (quem arredonda e o
    # sistema), e a bussola em 62% para caber na area segura do recorte.
    ("icone-maskable-512.png", 512, 0.62, 0),
    ("apple-touch-icon.png", 180, 1.0, 0),
]


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        nav = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        for nome, tam, escala, cantos in ICONES:
            pg = nav.new_context(viewport={"width": tam, "height": tam},
                                 device_scale_factor=1).new_page()
            # `rx` esta em unidades do viewBox (0..32), nao em pixels.
            pg.set_content(
                '<style>html,body{margin:0;padding:0;background:transparent}'
                f'svg{{display:block;width:{tam}px;height:{tam}px}}</style>'
                + desenho(escala, cantos * 32 / tam))
            pg.wait_for_timeout(120)
            pg.screenshot(path=str(SAIDA / nome), omit_background=False)
            pg.close()
        nav.close()
    for nome, *_ in ICONES:
        arq = SAIDA / nome
        print("%-26s %5.1f KB" % (arq.name, arq.stat().st_size / 1024))


if __name__ == "__main__":
    main()
