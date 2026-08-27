/* O desenho do movimento: um boneco animado por exercicio.
 *
 * POR QUE NAO VIDEO. O app inteiro tem que caber num arquivo que abre sem
 * internet — hoje sao uns 260 KB, menos que uma foto. Um video de dez
 * segundos por exercicio, para 62 exercicios, seriam dezenas de megabytes
 * e um app que nao abre no elevador. Uma figura parada resolveria o
 * tamanho e perderia o principal: exercicio e movimento, e o que a pessoa
 * precisa ver e o caminho entre as duas posicoes.
 *
 * Entao o boneco e desenhado por conta, em SVG, e animado entre poses. O
 * custo disso e proximo de zero (o modulo inteiro tem alguns KB), funciona
 * offline, aumenta sem borrar e acompanha a cor da tela.
 *
 * COMO FUNCIONA. Uma pose e um punhado de angulos, nao um punhado de
 * coordenadas: e mais facil escrever "joelho a 55 graus" do que descobrir
 * onde o joelho cai. A cinematica direta (`pontos`) transforma angulos em
 * pontos, e a animacao do SVG interpola de uma lista de pontos para a
 * outra — que e exatamente o movimento.
 *
 * Convencao dos angulos: 0 aponta para BAIXO, e o giro positivo vai para a
 * direita. Assim 90 e para a frente (o boneco olha para a direita), -90 e
 * para tras e 180 e para cima. O tronco e a unica excecao: 0 e em pe, e o
 * angulo mede a inclinacao para a frente, porque e assim que se fala de
 * tronco.
 */

const CAIXA = 100;
const CHAO = 93;

// Os ossos, em centesimos da caixa. Proporcao de gente, nao de heroi.
const TRONCO = 26, PESCOCO = 6, CABECA = 7;
const BRACO = 13, ANTEBRACO = 13;
const COXA = 17, CANELA = 17;

const RAD = Math.PI / 180;

function daPara(x, y, angulo, comprimento) {
  return [x + comprimento * Math.sin(angulo * RAD), y + comprimento * Math.cos(angulo * RAD)];
}

/* Onde a mao e o pe encostam.
 *
 * Escrever angulo funciona para membro solto no ar. Nao funciona para
 * membro apoiado: numa flexao a mao esta NO CHAO, e acertar isso por
 * tentativa de angulo faz o braco atravessar o piso — foi o que aconteceu
 * na primeira versao destes desenhos. Entao a pose diz o ponto, e a
 * cinematica inversa acha os dois angulos que levam ate ele.
 *
 * `lado` escolhe para onde a dobra aponta: 1 e -1 sao os dois jeitos de
 * alcancar o mesmo ponto, e sao a diferenca entre joelho para a frente e
 * joelho para tras.
 */
function resolver(ox, oy, alvo, l1, l2, lado) {
  const dx = alvo[0] - ox, dy = alvo[1] - oy;
  const bracoTodo = l1 + l2;
  let d = Math.sqrt(dx * dx + dy * dy);
  // Ponto longe demais ou perto demais: encosta no limite em vez de
  // devolver NaN e sumir com o membro da tela.
  d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(bracoTodo - 0.01, d));
  const rumo = Math.atan2(dx, dy) / RAD;
  const abertura = Math.acos((d * d + l1 * l1 - l2 * l2) / (2 * d * l1)) / RAD;
  const junta = Math.acos((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)) / RAD;
  const s = lado === undefined ? 1 : lado;
  const a1 = rumo + s * abertura;
  return [a1, a1 - s * (180 - junta)];
}

/* Um membro pode vir como dois angulos ou como um alvo. */
function angulos(membro, ox, oy, l1, l2) {
  if (Array.isArray(membro)) return membro;
  return resolver(ox, oy, membro.para, l1, l2, membro.lado);
}

/* Uma pose vira os pontos de cada traco. */
function pontos(pose) {
  const p = pose;
  const quadril = [p.qx, p.qy];
  // O tronco sobe: por isso o cosseno entra negativo.
  const ombro = [p.qx + TRONCO * Math.sin(p.tronco * RAD),
    p.qy - TRONCO * Math.cos(p.tronco * RAD)];
  const cabeca = [ombro[0] + (PESCOCO + CABECA) * Math.sin(p.tronco * RAD),
    ombro[1] - (PESCOCO + CABECA) * Math.cos(p.tronco * RAD)];

  function braco(membro) {
    const a = angulos(membro, ombro[0], ombro[1], BRACO, ANTEBRACO);
    const cotovelo = daPara(ombro[0], ombro[1], a[0], BRACO);
    const mao = daPara(cotovelo[0], cotovelo[1], a[1], ANTEBRACO);
    return [ombro, cotovelo, mao];
  }
  function perna(membro) {
    const a = angulos(membro, quadril[0], quadril[1], COXA, CANELA);
    const joelho = daPara(quadril[0], quadril[1], a[0], COXA);
    const pe = daPara(joelho[0], joelho[1], a[1], CANELA);
    return [quadril, joelho, pe];
  }

  return {
    tronco: [quadril, ombro],
    cabeca: cabeca,
    bracoLonge: braco(p.be),
    bracoPerto: braco(p.bd),
    pernaLonge: perna(p.pe),
    pernaPerto: perna(p.pd),
  };
}

function lista(pares) {
  return pares.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
}

/* ------------------------------------------------------------------ *
 * As poses                                                            *
 * ------------------------------------------------------------------ */
/* qx,qy = quadril. tronco = inclinacao para a frente. be/bd = [ombro,
   cotovelo] do braco de longe e do de perto. pe/pd = [quadril, joelho]. */
const POSES = {
  'em-pe': { qx: 48, qy: 58, tronco: 0, be: [-15, -13], bd: [15, 13], pe: [-8, -6], pd: [8, 6] },
  'em-pe-firme': { qx: 48, qy: 58, tronco: 0, be: [-9, -8], bd: [9, 8], pe: [-12, -9], pd: [12, 9] },

  agachado: { qx: 44, qy: 74, tronco: 30, be: [66, 70], bd: [70, 74],
    pe: { para: [44, 92], lado: -1 }, pd: { para: [48, 92], lado: -1 } },
  'meio-agachado': { qx: 46, qy: 66, tronco: 18, be: [34, 42], bd: [38, 46],
    pe: { para: [45, 92], lado: -1 }, pd: { para: [49, 92], lado: -1 } },
  cadeirinha: { qx: 40, qy: 76, tronco: 0, be: [8, 8], bd: [12, 12],
    pe: { para: [57, 92], lado: -1 }, pd: { para: [60, 92], lado: -1 } },

  'dobradica-baixo': { qx: 48, qy: 58, tronco: 66, be: [6, 6], bd: [10, 10],
    pe: { para: [44, 92], lado: -1 }, pd: { para: [47, 92], lado: -1 } },
  'dobradica-solto': { qx: 48, qy: 56, tronco: 84, be: [4, 4], bd: [8, 8],
    pe: [-74, -70], pd: { para: [47, 92], lado: -1 } },

  'afundo-baixo': { qx: 48, qy: 70, tronco: 8, be: [-22, -26], bd: [22, 26],
    pe: { para: [26, 92], lado: 1 }, pd: { para: [68, 92], lado: -1 } },
  'passada-lado': { qx: 48, qy: 68, tronco: 14, be: [44, 50], bd: [48, 54],
    pe: { para: [20, 92], lado: 1 }, pd: { para: [74, 92], lado: -1 } },

  'prancha-alta': { qx: 54, qy: 76, tronco: 70,
    be: { para: [76, 92], lado: 1 }, bd: { para: [79, 92], lado: 1 },
    pe: { para: [22, 92], lado: 1 }, pd: { para: [25, 92], lado: 1 } },
  'prancha-baixa': { qx: 56, qy: 84, tronco: 72,
    be: { para: [76, 92], lado: 1 }, bd: { para: [79, 92], lado: 1 },
    pe: { para: [24, 92], lado: 1 }, pd: { para: [27, 92], lado: 1 } },
  'prancha-cotovelo': { qx: 52, qy: 84, tronco: 72,
    be: { para: [90, 92], lado: 1 }, bd: { para: [93, 92], lado: 1 },
    pe: { para: [20, 92], lado: 1 }, pd: { para: [23, 92], lado: 1 } },
  'prancha-toque': { qx: 54, qy: 76, tronco: 70,
    be: { para: [76, 92], lado: 1 }, bd: [-56, -140],
    pe: { para: [22, 92], lado: 1 }, pd: { para: [25, 92], lado: 1 } },
  'v-invertido': { qx: 48, qy: 60, tronco: 106,
    be: { para: [76, 92], lado: 1 }, bd: { para: [79, 92], lado: 1 },
    pe: { para: [26, 92], lado: 1 }, pd: { para: [29, 92], lado: 1 } },

  'remada-solta': { qx: 46, qy: 58, tronco: 68, be: [6, 6], bd: [10, 10],
    pe: { para: [42, 92], lado: -1 }, pd: { para: [45, 92], lado: -1 } },
  'remada-puxada': { qx: 46, qy: 58, tronco: 68, be: [-26, -118], bd: [-22, -114],
    pe: { para: [42, 92], lado: -1 }, pd: { para: [45, 92], lado: -1 } },

  'bracos-ombro': { qx: 48, qy: 58, tronco: 0, be: [-16, -146], bd: [16, 146],
    pe: [-9, -7], pd: [9, 7] },
  'bracos-cima': { qx: 48, qy: 58, tronco: 0, be: [-174, -178], bd: [174, 178],
    pe: [-9, -7], pd: [9, 7] },

  pendurado: { qx: 50, qy: 70, tronco: 2,
    be: { para: [47, 18], lado: 1 }, bd: { para: [52, 18], lado: -1 },
    pe: [-26, -72], pd: [-22, -68] },
  'queixo-barra': { qx: 50, qy: 61, tronco: 2,
    be: { para: [47, 18], lado: 1 }, bd: { para: [52, 18], lado: -1 },
    pe: [-26, -72], pd: [-22, -68] },

  deitado: { qx: 44, qy: 88, tronco: 94, be: [-84, -88], bd: [-80, -84],
    pe: { para: [58, 92], lado: 1 }, pd: { para: [61, 92], lado: 1 } },
  'ponte-cima': { qx: 48, qy: 72, tronco: 134, be: [-80, -84], bd: [-76, -80],
    pe: { para: [36, 92], lado: -1 }, pd: { para: [39, 92], lado: -1 } },
  canoa: { qx: 46, qy: 88, tronco: 94, be: [172, 176], bd: [176, 180],
    pe: [150, 110], pd: [154, 114] },
  'canoa-aberta': { qx: 46, qy: 88, tronco: 94, be: [158, 150], bd: [162, 154],
    pe: [128, 122], pd: [132, 126] },
  'pernas-cima': { qx: 46, qy: 88, tronco: 94, be: [-84, -88], bd: [-80, -84],
    pe: [178, 180], pd: [182, 184] },

  'sentado-v': { qx: 54, qy: 80, tronco: -38, be: [78, 78], bd: [82, 82],
    pe: { para: [76, 92], lado: -1 }, pd: { para: [79, 92], lado: -1 } },
  'sentado-v-lado': { qx: 54, qy: 80, tronco: -38, be: [110, 110], bd: [114, 114],
    pe: { para: [76, 92], lado: -1 }, pd: { para: [79, 92], lado: -1 } },

  'joelho-alto': { qx: 48, qy: 58, tronco: 6, be: [-44, -104], bd: [40, 100],
    pe: { para: [46, 92], lado: -1 }, pd: [68, 24] },
  'joelho-alto-troca': { qx: 48, qy: 58, tronco: 6, be: [44, 104], bd: [-40, -100],
    pe: [68, 24], pd: { para: [46, 92], lado: -1 } },
  'escalador-a': { qx: 54, qy: 76, tronco: 70,
    be: { para: [76, 92], lado: 1 }, bd: { para: [79, 92], lado: 1 },
    pe: { para: [22, 92], lado: 1 }, pd: [104, -23] },
  'escalador-b': { qx: 54, qy: 76, tronco: 70,
    be: { para: [76, 92], lado: 1 }, bd: { para: [79, 92], lado: 1 },
    pe: [104, -23], pd: { para: [25, 92], lado: 1 } },

  'polichinelo-fechado': { qx: 48, qy: 58, tronco: 0, be: [-10, -8], bd: [10, 8],
    pe: [-7, -5], pd: [7, 5] },
  'polichinelo-aberto': { qx: 48, qy: 58, tronco: 0, be: [-168, -172], bd: [168, 172],
    pe: [-28, -32], pd: [28, 32] },

  'corda-baixo': { qx: 48, qy: 58, tronco: 2, be: [-52, -108], bd: [52, 108],
    pe: [-7, -5], pd: [7, 5] },
  'corda-salto': { qx: 48, qy: 52, tronco: 2, be: [-56, -112], bd: [56, 112],
    pe: [-10, -30], pd: [10, -26] },

  'caminha-a': { qx: 48, qy: 58, tronco: 4, be: [4, 4], bd: [8, 8],
    pe: [-17, -13], pd: [17, 13] },
  'caminha-b': { qx: 48, qy: 58, tronco: 4, be: [4, 4], bd: [8, 8],
    pe: [17, 13], pd: [-17, -13] },

  'urso-a': { qx: 54, qy: 70, tronco: 76,
    be: { para: [80, 92], lado: 1 }, bd: { para: [86, 92], lado: 1 },
    pe: { para: [42, 92], lado: 1 }, pd: { para: [34, 92], lado: 1 } },
  'urso-b': { qx: 54, qy: 70, tronco: 76,
    be: { para: [86, 92], lado: 1 }, bd: { para: [80, 92], lado: 1 },
    pe: { para: [34, 92], lado: 1 }, pd: { para: [42, 92], lado: 1 } },

  'subida-caixa': { qx: 46, qy: 62, tronco: 14, be: [-12, -16], bd: [12, 16],
    pe: { para: [38, 92], lado: -1 }, pd: { para: [68, 74], lado: -1 } },
  'subida-caixa-cima': { qx: 56, qy: 52, tronco: 8, be: [-12, -16], bd: [12, 16],
    pe: [-30, -60], pd: { para: [70, 74], lado: -1 } },

  gato: { qx: 56, qy: 60, tronco: 100,
    be: { para: [82, 92], lado: 1 }, bd: { para: [85, 92], lado: 1 },
    pe: { para: [46, 92], lado: 1 }, pd: { para: [49, 92], lado: 1 } },
  camelo: { qx: 56, qy: 66, tronco: 88,
    be: { para: [82, 92], lado: 1 }, bd: { para: [85, 92], lado: 1 },
    pe: { para: [46, 92], lado: 1 }, pd: { para: [49, 92], lado: 1 } },
  crianca: { qx: 48, qy: 80, tronco: 112,
    be: { para: [92, 92], lado: 1 }, bd: { para: [95, 92], lado: 1 },
    pe: [-42, -102], pd: [-38, -98] },

  'alonga-frente': { qx: 46, qy: 60, tronco: 60, be: [20, 24], bd: [24, 28],
    pe: { para: [40, 92], lado: -1 }, pd: { para: [72, 92], lado: -1 } },
  'alonga-quadriceps': { qx: 48, qy: 58, tronco: 2, be: [-16, -22], bd: [-32, -104],
    pe: { para: [46, 92], lado: -1 }, pd: [-30, -140] },
  'alonga-panturrilha': { qx: 46, qy: 58, tronco: 20, be: [46, 52], bd: [50, 56],
    pe: { para: [22, 92], lado: 1 }, pd: { para: [62, 92], lado: -1 } },
  'alonga-peito': { qx: 48, qy: 58, tronco: 8, be: [-18, -24], bd: [100, 150],
    pe: [-9, -7], pd: [9, 7] },
  'torcao-a': { qx: 44, qy: 88, tronco: 94, be: [-86, -92], bd: [86, 92],
    pe: [140, 100], pd: [144, 104] },
  'torcao-b': { qx: 44, qy: 88, tronco: 94, be: [-86, -92], bd: [86, 92],
    pe: [108, 62], pd: [112, 66] },
  'joelho-peito': { qx: 44, qy: 88, tronco: 94, be: [130, 92], bd: [134, 96],
    pe: [142, 84], pd: [146, 88] },
  respira: { qx: 48, qy: 58, tronco: 0, be: [-13, -11], bd: [13, 11], pe: [-8, -6], pd: [8, 6] },
  'respira-cheio': { qx: 48, qy: 56, tronco: -3, be: [-20, -18], bd: [20, 18],
    pe: [-8, -6], pd: [8, 6] },

  'braco-circulo-a': { qx: 48, qy: 58, tronco: 0, be: [-88, -90], bd: [88, 90],
    pe: [-9, -7], pd: [9, 7] },
  'braco-circulo-b': { qx: 48, qy: 58, tronco: 0, be: [-176, -178], bd: [176, 178],
    pe: [-9, -7], pd: [9, 7] },
  'tronco-gira-a': { qx: 48, qy: 58, tronco: -6, be: [-74, -128], bd: [74, 22],
    pe: [-11, -8], pd: [11, 8] },
  'tronco-gira-b': { qx: 48, qy: 58, tronco: 6, be: [-74, -22], bd: [74, 128],
    pe: [-11, -8], pd: [11, 8] },
  'quadril-aberto': { qx: 46, qy: 72, tronco: 30, be: { para: [62, 92], lado: 1 }, bd: [46, 80],
    pe: { para: [24, 92], lado: 1 }, pd: { para: [70, 92], lado: -1 } },
};

/* ------------------------------------------------------------------ *
 * Os movimentos: quais poses, em que ordem, em quanto tempo            *
 * ------------------------------------------------------------------ */
/* `apoio` desenha o que nao e o corpo: a caixa no chao, a barra em cima, o
   peso na mao. Sem isso a barra fixa vira um boneco flutuando. */
const MOVIMENTOS = {
  agachar: { poses: ['em-pe', 'agachado'], dur: 2.8 },
  'meio-agachar': { poses: ['em-pe', 'meio-agachado'], dur: 2.4 },
  segurar: { poses: ['cadeirinha', 'cadeirinha'], dur: 3.4, apoio: 'parede' },
  dobradica: { poses: ['em-pe', 'dobradica-baixo'], dur: 2.8 },
  'dobradica-solta': { poses: ['em-pe', 'dobradica-solto'], dur: 2.4 },
  afundo: { poses: ['em-pe', 'afundo-baixo'], dur: 2.6 },
  'passada-lateral': { poses: ['em-pe', 'passada-lado'], dur: 2.4 },
  flexao: { poses: ['prancha-alta', 'prancha-baixa'], dur: 2.4 },
  'flexao-ombro': { poses: ['v-invertido', 'prancha-baixa'], dur: 2.6 },
  prancha: { poses: ['prancha-cotovelo', 'prancha-cotovelo'], dur: 3.6 },
  'prancha-toca': { poses: ['prancha-alta', 'prancha-toque'], dur: 2.6 },
  remada: { poses: ['remada-solta', 'remada-puxada'], dur: 2.4 },
  desenvolvimento: { poses: ['bracos-ombro', 'bracos-cima'], dur: 2.4, apoio: 'peso' },
  barra: { poses: ['pendurado', 'queixo-barra'], dur: 2.8, apoio: 'barra' },
  ponte: { poses: ['deitado', 'ponte-cima'], dur: 2.6 },
  canoa: { poses: ['canoa', 'canoa-aberta'], dur: 2.8 },
  'pernas-cima': { poses: ['deitado', 'pernas-cima'], dur: 2.8 },
  giro: { poses: ['sentado-v', 'sentado-v-lado'], dur: 2.2 },
  correr: { poses: ['joelho-alto', 'joelho-alto-troca'], dur: 1.1 },
  escalador: { poses: ['escalador-a', 'escalador-b'], dur: 1.2 },
  polichinelo: { poses: ['polichinelo-fechado', 'polichinelo-aberto'], dur: 1.2 },
  corda: { poses: ['corda-baixo', 'corda-salto'], dur: 1.0, apoio: 'corda' },
  caminhar: { poses: ['caminha-a', 'caminha-b'], dur: 1.6, apoio: 'peso-dois' },
  urso: { poses: ['urso-a', 'urso-b'], dur: 1.8 },
  'subir-caixa': { poses: ['subida-caixa', 'subida-caixa-cima'], dur: 2.6, apoio: 'caixa' },
  burpee: { poses: ['em-pe', 'agachado', 'prancha-alta', 'agachado'], dur: 3.6, capa: 2 },
  'burpee-salto': { poses: ['polichinelo-aberto', 'agachado', 'prancha-baixa', 'agachado'],
    dur: 3.6, capa: 2 },
  'gato-camelo': { poses: ['gato', 'camelo'], dur: 3.0 },
  crianca: { poses: ['crianca', 'crianca'], dur: 3.6 },
  'braco-circulo': { poses: ['braco-circulo-a', 'braco-circulo-b'], dur: 1.8 },
  'tronco-gira': { poses: ['tronco-gira-a', 'tronco-gira-b'], dur: 2.0 },
  'quadril-abre': { poses: ['em-pe', 'quadril-aberto'], dur: 3.0 },
  'alonga-frente': { poses: ['em-pe', 'alonga-frente'], dur: 3.4 },
  'alonga-quadriceps': { poses: ['alonga-quadriceps', 'alonga-quadriceps'], dur: 3.6 },
  'alonga-panturrilha': { poses: ['alonga-panturrilha', 'alonga-panturrilha'], dur: 3.6 },
  'alonga-peito': { poses: ['alonga-peito', 'alonga-peito'], dur: 3.6 },
  torcao: { poses: ['torcao-a', 'torcao-b'], dur: 3.2 },
  'joelho-peito': { poses: ['deitado', 'joelho-peito'], dur: 3.2 },
  respirar: { poses: ['respira', 'respira-cheio'], dur: 4.0 },
  'balanco-peso': { poses: ['dobradica-baixo', 'em-pe-firme'], dur: 1.8, apoio: 'peso' },
  'arremesso': { poses: ['bracos-cima', 'agachado'], dur: 2.0, apoio: 'bola' },
  'levantar-chao': { poses: ['deitado', 'em-pe-firme'], dur: 3.6, apoio: 'peso' },
};

/* De cada exercicio para o seu movimento. O que nao esta aqui cai no
   padrao do exercicio, la embaixo — assim um exercicio novo no catalogo ja
   nasce com desenho, mesmo antes de alguem desenhar o dele. */
const DO_EXERCICIO = {
  'trote-parado': 'correr',
  'circulo-de-bracos': 'braco-circulo',
  'rotacao-de-tronco': 'tronco-gira',
  'gato-camelo': 'gato-camelo',
  'abertura-de-quadril': 'quadril-abre',
  'agachamento-solto': 'meio-agachar',
  'elevacao-de-joelho': 'correr',
  'polichinelo-leve': 'polichinelo',

  'agachamento-livre': 'agachar',
  'agachamento-sumo': 'agachar',
  'agachamento-goblet': 'agachar',
  'agachamento-na-parede': 'segurar',
  'agachamento-bulgaro': 'afundo',
  'agachamento-com-salto': 'agachar',

  'ponte-de-gluteo': 'ponte',
  'ponte-unilateral': 'ponte',
  'bom-dia': 'dobradica',
  'terra-halter': 'dobradica',
  'stiff-unilateral': 'dobradica-solta',
  'balanco-kettlebell': 'balanco-peso',

  'afundo-reverso': 'afundo',
  'afundo-alternado': 'afundo',
  'passada-lateral': 'passada-lateral',
  'subida-na-caixa': 'subir-caixa',
  'afundo-com-salto': 'afundo',

  'flexao-inclinada': 'flexao',
  'flexao-de-braco': 'flexao',
  'flexao-diamante': 'flexao',
  'flexao-pike': 'flexao-ombro',
  'desenvolvimento-halter': 'desenvolvimento',
  'supino-no-chao': 'desenvolvimento',

  'remada-elastico': 'remada',
  'abre-elastico': 'braco-circulo',
  'remada-serrote': 'remada',
  'remada-curvada': 'remada',
  'remada-invertida': 'barra',
  'barra-fixa': 'barra',

  prancha: 'prancha',
  'prancha-toque-no-ombro': 'prancha-toca',
  'prancha-lateral': 'prancha',
  'abdominal-morto': 'canoa',
  canoa: 'canoa',
  'elevacao-de-pernas': 'pernas-cima',
  'giro-russo': 'giro',
  escalador: 'escalador',
  'passeio-do-fazendeiro': 'caminhar',

  'burpee-sem-salto': 'burpee',
  burpee: 'burpee-salto',
  'urso-caminhando': 'urso',
  polichinelo: 'polichinelo',
  'corrida-parado': 'correr',
  'pular-corda': 'corda',
  'arremesso-de-bola': 'arremesso',
  'levantar-do-chao': 'levantar-chao',

  'respiracao-longa': 'respirar',
  'postura-da-crianca': 'crianca',
  'along-posterior': 'alonga-frente',
  'along-quadriceps': 'alonga-quadriceps',
  'along-panturrilha': 'alonga-panturrilha',
  'along-peitoral': 'alonga-peito',
  'torcao-deitada': 'torcao',
  'joelho-ao-peito': 'joelho-peito',
};

// A rede de seguranca: exercicio sem desenho proprio usa o do seu padrao.
const DO_PADRAO = {
  agachar: 'agachar',
  dobradica: 'dobradica',
  avancar: 'afundo',
  empurrar: 'flexao',
  puxar: 'remada',
  girar: 'tronco-gira',
  sustentar: 'prancha',
  deslocar: 'correr',
};

function movimentoDe(id, padrao) {
  return MOVIMENTOS[DO_EXERCICIO[id]] ? DO_EXERCICIO[id]
    : (DO_PADRAO[padrao] || 'agachar');
}

/* ------------------------------------------------------------------ *
 * O desenho                                                           *
 * ------------------------------------------------------------------ */

/* A animacao vai e volta: A;B;A. Sem a volta, o boneco saltaria da ultima
   pose para a primeira, e um salto no meio de um agachamento ensina o
   movimento errado. */
function idaEVolta(nomes) {
  const ida = nomes.slice();
  const volta = nomes.slice(0, -1).reverse();
  return ida.concat(volta);
}

function tempos(quantos) {
  const t = [];
  for (let i = 0; i < quantos; i += 1) t.push((i / (quantos - 1)).toFixed(4));
  return t.join(';');
}

function curvas(quantos) {
  const c = [];
  for (let i = 0; i < quantos - 1; i += 1) c.push('.42 0 .58 1');
  return c.join(';');
}

function anima(atributo, valores, dur, animar) {
  if (!animar || valores.length < 2) return '';
  return '<animate attributeName="' + atributo + '" dur="' + dur + 's" repeatCount="indefinite"'
    + ' calcMode="spline" keyTimes="' + tempos(valores.length) + '"'
    + ' keySplines="' + curvas(valores.length) + '"'
    + ' values="' + valores.join(';') + '"/>';
}

function traco(classe, valores, dur, animar) {
  return '<polyline class="' + classe + '" points="' + valores[0] + '">'
    + anima('points', valores, dur, animar) + '</polyline>';
}

function apoios(nome) {
  if (nome === 'parede') {
    return '<line class="bo-apoio" x1="30" y1="30" x2="30" y2="93"/>';
  }
  if (nome === 'barra') {
    return '<line class="bo-apoio" x1="22" y1="18" x2="78" y2="18"/>';
  }
  if (nome === 'caixa') {
    return '<rect class="bo-apoio-cheio" x="58" y="74" width="30" height="19" rx="2"/>';
  }
  return '';
}

/* O peso na mao acompanha a mao, senao ele fica no ar enquanto o boneco
   levanta. Por isso o apoio tambem e animado, com os mesmos tempos. */
function apoioNaMao(nome, quadros, dur, animar) {
  // A corda nao entra: um circulo na mao viraria um halter, e quem pula
  // corda ja se reconhece pelo movimento do punho.
  if (nome !== 'peso' && nome !== 'peso-dois' && nome !== 'bola') return '';
  const raio = nome === 'bola' ? 7 : 4.6;
  const maos = quadros.map((q) => q.bracoPerto[2]);
  const cx = maos.map((m) => m[0].toFixed(1));
  const cy = maos.map((m) => m[1].toFixed(1));
  let saida = '<circle class="bo-apoio-cheio" r="' + raio + '" cx="' + cx[0] + '" cy="' + cy[0] + '">'
    + anima('cx', cx, dur, animar) + anima('cy', cy, dur, animar) + '</circle>';
  if (nome === 'peso-dois') {
    const outras = quadros.map((q) => q.bracoLonge[2]);
    const ex = outras.map((m) => m[0].toFixed(1));
    const ey = outras.map((m) => m[1].toFixed(1));
    saida += '<circle class="bo-apoio-cheio bo-longe" r="' + raio + '" cx="' + ex[0] + '" cy="' + ey[0] + '">'
      + anima('cx', ex, dur, animar) + anima('cy', ey, dur, animar) + '</circle>';
  }
  return saida;
}

/* O SVG do exercicio. Devolve texto: este arquivo nao toca no DOM, entao da
   para conferir o desenho no node. */
function svg(idExercicio, opcoes) {
  const o = opcoes || {};
  const nome = o.movimento || movimentoDe(idExercicio, o.padrao);
  const mov = MOVIMENTOS[nome] || MOVIMENTOS.agachar;
  const animar = o.animar !== false;
  const dur = o.duracao || mov.dur;

  // Figura parada mostra a pose CARACTERISTICA, nao a primeira. Quase todo
  // movimento comeca em pe, entao usar a primeira faria a lista inteira do
  // catalogo virar 62 bonecos identicos — foi o que aconteceu na primeira
  // versao. A segunda pose e a que diz o que o exercicio e; quando nao e,
  // o movimento diz qual e pela `capa`.
  const capa = mov.capa === undefined ? Math.min(1, mov.poses.length - 1) : mov.capa;
  const sequencia = animar ? idaEVolta(mov.poses) : [mov.poses[capa]];
  const quadros = sequencia.map((p) => pontos(POSES[p] || POSES['em-pe']));

  const partes = ['tronco', 'bracoLonge', 'bracoPerto', 'pernaLonge', 'pernaPerto'];
  const classes = {
    tronco: 'bo-osso', bracoLonge: 'bo-osso bo-longe', bracoPerto: 'bo-osso',
    pernaLonge: 'bo-osso bo-longe', pernaPerto: 'bo-osso',
  };

  let corpo = '';
  partes.forEach((parte) => {
    corpo += traco(classes[parte], quadros.map((q) => lista(q[parte])), dur, animar);
  });

  const cx = quadros.map((q) => q.cabeca[0].toFixed(1));
  const cy = quadros.map((q) => q.cabeca[1].toFixed(1));
  const cabeca = '<circle class="bo-cabeca" r="' + CABECA + '" cx="' + cx[0] + '" cy="' + cy[0] + '">'
    + anima('cx', cx, dur, animar) + anima('cy', cy, dur, animar) + '</circle>';

  return '<svg class="boneco" viewBox="0 0 ' + CAIXA + ' ' + CAIXA + '" aria-hidden="true">'
    + '<line class="bo-chao" x1="6" y1="' + CHAO + '" x2="94" y2="' + CHAO + '"/>'
    + apoios(mov.apoio)
    + corpo + cabeca
    + apoioNaMao(mov.apoio, quadros, dur, animar)
    + '</svg>';
}

const Bonecos = { svg, movimentoDe, pontos, resolver, POSES, MOVIMENTOS, DO_EXERCICIO, DO_PADRAO };

if (typeof module !== 'undefined' && module.exports) module.exports = Bonecos;
else window.Bonecos = Bonecos;
