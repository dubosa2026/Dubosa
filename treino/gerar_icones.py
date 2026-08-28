"""Desenha os icones do app, sem depender de nada.

    python3 treino/gerar_icones.py

Escreve os PNGs em `treino/src/icones/`. O build so os copia para
`treino/dist/`.

Por que um rasterizador escrito na mao em vez de Pillow: este repositorio
roda em maquinas diferentes e o Pillow nao esta em todas. Um icone de 512
pixels feito de tres circulos e um retangulo arredondado nao justifica uma
dependencia binaria que pode faltar justo no dia do build. O modulo `zlib`
e o `struct` ja vem com o Python, e o PNG e um formato simples: cabecalho,
linhas cruas comprimidas e fim.

A marca e a mesma do cabecalho do app: um anel cinza (o circuito), o arco
amarelo por cima (a volta que voce esta fazendo agora) e o ponto no meio.
"""

import math
import struct
import zlib
from pathlib import Path

SAIDA = Path(__file__).resolve().parent / "src" / "icones"

FUNDO = (0x0A, 0x0A, 0x0B, 255)
CINZA = (0x3A, 0x3A, 0x43, 255)
AMARELO = (0xFF, 0xC7, 0x2C, 255)
VAZIO = (0, 0, 0, 0)

# O arco amarelo, em graus, no sentido do relogio a partir do topo. Comeca
# um pouco antes do topo para o olho ler "volta comecando", nao "pedaco
# faltando".
ARCO_DE, ARCO_ATE = -105.0, 35.0


def cor_no_ponto(x, y, canto, raio_anel, grossura, raio_ponto, arredondar):
    """Que cor tem o ponto (x, y), em coordenadas de 0 a 1."""
    dx, dy = x - 0.5, y - 0.5
    dist = math.hypot(dx, dy)

    if dist <= raio_ponto:
        return AMARELO

    if abs(dist - raio_anel) <= grossura / 2:
        ang = math.degrees(math.atan2(dy, dx)) + 90.0   # 0 = topo
        if ang > 180.0:
            ang -= 360.0
        if ARCO_DE <= ang <= ARCO_ATE:
            return AMARELO
        return CINZA

    if not arredondar:
        return FUNDO

    # Retangulo arredondado: so o canto precisa de conta, o resto e o
    # proprio quadrado.
    px, py = abs(x - 0.5), abs(y - 0.5)
    limite = 0.5 - canto
    if px <= limite or py <= limite:
        return FUNDO
    return FUNDO if math.hypot(px - limite, py - limite) <= canto else VAZIO


def gerar(tamanho, arredondar=True, arte=1.0, amostras=3):
    """Um PNG RGBA de `tamanho` x `tamanho`, com antisserrilhado por
    superamostragem: cada pixel e a media de `amostras` x `amostras` pontos.
    Sem isso o anel fica com degrau de escada, que num icone de 192 pixels
    e a diferenca entre parecer um app e parecer um desenho."""
    canto = 0.22
    raio_anel = 0.30 * arte
    grossura = 0.085 * arte
    raio_ponto = 0.075 * arte
    passo = 1.0 / (tamanho * amostras)

    linhas = []
    for py in range(tamanho):
        linha = bytearray()
        for px in range(tamanho):
            r = g = b = a = 0
            for sy in range(amostras):
                y = (py * amostras + sy + 0.5) * passo
                for sx in range(amostras):
                    x = (px * amostras + sx + 0.5) * passo
                    c = cor_no_ponto(x, y, canto, raio_anel, grossura, raio_ponto, arredondar)
                    r += c[0] * c[3]
                    g += c[1] * c[3]
                    b += c[2] * c[3]
                    a += c[3]
            n = amostras * amostras
            if a:
                linha += bytes((round(r / a), round(g / a), round(b / a), round(a / n)))
            else:
                linha += b"\0\0\0\0"
        linhas.append(bytes(linha))
    return montar_png(tamanho, linhas)


def montar_png(tamanho, linhas):
    cru = b"".join(b"\x00" + linha for linha in linhas)

    def bloco(tipo, dados):
        return (struct.pack(">I", len(dados)) + tipo + dados
                + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + bloco(b"IHDR", struct.pack(">IIBBBBB", tamanho, tamanho, 8, 6, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(cru, 9))
            + bloco(b"IEND", b""))


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    # NENHUM icone tem canto transparente, e nenhum encosta na borda.
    #
    # A primeira versao desenhava os icones "any" como quadrado arredondado
    # com os cantos transparentes, do jeito que fica bonito num navegador de
    # computador. No celular isso da errado duas vezes: o Android aplica o
    # PROPRIO recorte (circulo, quadrado arredondado, o que o fabricante
    # quiser) e, com a arte encostando na borda, ele cortava o arco amarelo
    # em cima; e o canto transparente faz alguns lancadores desenharem uma
    # placa branca atras, que e o oposto de parecer um app instalado.
    #
    # Entao: fundo ate a borda, sempre, e a arte encolhida para caber em
    # qualquer recorte. O `maskable` encolhe mais (76%), porque a area
    # segura dele e menor — o sistema pode cortar ate 20% de cada lado.
    trabalhos = [
        ("icone-192.png", 192, False, 0.86),
        ("icone-512.png", 512, False, 0.86),
        ("icone-maskable-512.png", 512, False, 0.76),
        ("apple-touch-icon.png", 180, False, 0.86),
    ]
    for nome, tam, arredondar, arte in trabalhos:
        dados = gerar(tam, arredondar, arte)
        (SAIDA / nome).write_bytes(dados)
        print("%-26s %4d px  %5.1f KB" % (nome, tam, len(dados) / 1024))


if __name__ == "__main__":
    main()
