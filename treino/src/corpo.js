/* Medidas do corpo: peso, cintura, quadril, IMC e a evolucao de cada um.
 *
 * Duas decisoes que valem explicar.
 *
 * A ALTURA MORA NOS AJUSTES, nao na medida. Ela nao muda de mes para mes, e
 * pedir a altura toda vez que a pessoa sobe na balanca e o jeito mais
 * rapido de ela parar de anotar o peso.
 *
 * O IMC APARECE COM RESSALVA, sempre. Ele divide peso por altura ao
 * quadrado e nao sabe o que e musculo: quem comeca a treinar frequentemente
 * ganha peso e "piora" no IMC enquanto melhora de verdade. Um app de treino
 * que mostra IMC sem dizer isso empurra a pessoa para a conclusao errada
 * bem no mes em que ela mais precisa continuar. Por isso a cintura fica ao
 * lado dele na tela: ela responde melhor a pergunta que a pessoa esta
 * fazendo.
 */

/* eslint-disable no-undef */
const F = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./formato.js') : window.Formato;

const CAMPOS = [
  { id: 'peso', nome: 'Peso', unidade: 'kg', min: 25, max: 350, casas: 1 },
  { id: 'cintura', nome: 'Cintura', unidade: 'cm', min: 40, max: 200, casas: 0 },
  { id: 'quadril', nome: 'Quadril', unidade: 'cm', min: 40, max: 200, casas: 0 },
];

/* As faixas da Organizacao Mundial da Saude. Valem para adulto, e so. */
const FAIXAS = [
  { ate: 18.5, nome: 'abaixo do peso', tom: 'atencao' },
  { ate: 25, nome: 'peso normal', tom: 'bom' },
  { ate: 30, nome: 'sobrepeso', tom: 'atencao' },
  { ate: 35, nome: 'obesidade grau 1', tom: 'alerta' },
  { ate: 40, nome: 'obesidade grau 2', tom: 'alerta' },
  { ate: Infinity, nome: 'obesidade grau 3', tom: 'alerta' },
];

function limpar(valor, campo) {
  const n = Number(String(valor).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  if (campo && (n < campo.min || n > campo.max)) return null;
  return n;
}

function campoPorId(id) {
  return CAMPOS.filter((c) => c.id === id)[0] || null;
}

/* Uma anotacao do corpo. Campo em branco fica em branco: quem so quer
   pesar nao precisa medir a cintura, e obrigar isso faria a pessoa
   inventar um numero — que e pior que nao ter numero nenhum. */
function anotar(estado, bruta) {
  const b = bruta || {};
  const nova = { id: String(b.id || (b.data || F.hoje()) + '-' + Date.now().toString(36)),
    data: String(b.data || F.hoje()) };
  let temAlgo = false;
  CAMPOS.forEach((c) => {
    const v = limpar(b[c.id], c);
    if (v !== null) { nova[c.id] = v; temAlgo = true; }
  });
  if (!temAlgo) return null;

  const copia = Object.assign({}, estado);
  // Uma anotacao por dia: pesar de novo no mesmo dia corrige a anterior em
  // vez de virar duas linhas iguais no historico.
  //
  // E corrigir e MESCLAR, nao substituir. Quem mediu a cintura de manha e
  // volta a tarde so para acertar o peso nao pode perder a cintura: os
  // campos que ela deixou em branco agora sao os que ela nao quis mexer,
  // nao os que ela quis apagar.
  const doDia = (estado.medidas || []).filter((m) => m.data === nova.data)[0];
  const resto = (estado.medidas || []).filter((m) => m.data !== nova.data);
  const linha = doDia ? Object.assign({}, doDia, nova, { id: doDia.id }) : nova;
  copia.medidas = [linha].concat(resto).sort((x, y) => (x.data < y.data ? 1 : -1));
  return copia;
}

function apagar(estado, id) {
  const copia = Object.assign({}, estado);
  copia.medidas = (estado.medidas || []).filter((m) => m.id !== id);
  return copia;
}

function normalizarMedidas(bruto) {
  return (Array.isArray(bruto) ? bruto : [])
    .filter((m) => m && m.data)
    .map((m) => {
      const nova = { id: String(m.id || m.data), data: String(m.data) };
      CAMPOS.forEach((c) => {
        const v = limpar(m[c.id], c);
        if (v !== null) nova[c.id] = v;
      });
      return nova;
    })
    .filter((m) => CAMPOS.some((c) => m[c.id] !== undefined))
    .sort((x, y) => (x.data < y.data ? 1 : (x.data > y.data ? -1 : 0)));
}

/* ------------------------------------------------------------------ *
 * As contas                                                           *
 * ------------------------------------------------------------------ */
function imc(peso, alturaCm) {
  const p = Number(peso), a = Number(alturaCm) / 100;
  if (!p || !a) return null;
  return p / (a * a);
}

function faixaDoImc(valor) {
  if (valor === null || valor === undefined) return null;
  return FAIXAS.filter((f) => valor < f.ate)[0] || FAIXAS[FAIXAS.length - 1];
}

/* Peso que deixaria o IMC em 24,9 — o topo da faixa normal. Serve de
   referencia, nao de meta: quem treina pode ficar acima disso com saude. */
function pesoDeReferencia(alturaCm) {
  const a = Number(alturaCm) / 100;
  if (!a) return null;
  return { de: 18.5 * a * a, ate: 24.9 * a * a };
}

/* Cintura dividida por quadril. Numero solto, sem faixa de risco: as
   faixas mudam com sexo e etnia, e o app nao pergunta isso. O que interessa
   aqui e a direcao ao longo do tempo. */
function rcq(medida) {
  if (!medida || !medida.cintura || !medida.quadril) return null;
  return medida.cintura / medida.quadril;
}

function ultima(medidas, campo) {
  const l = medidas || [];
  for (let i = 0; i < l.length; i += 1) {
    if (l[i][campo] !== undefined) return l[i];
  }
  return null;
}

/* A serie de um campo, do mais antigo para o mais novo — o grafico. */
function serie(medidas, campo) {
  return (medidas || [])
    .filter((m) => m[campo] !== undefined)
    .map((m) => ({ data: m.data, valor: m[campo] }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}

/* Quanto mudou, e em quanto tempo — olhando o ultimo mes.
 *
 * A janela e fixa de proposito. A primeira versao comparava com o ponto
 * mais recente que estivesse a pelo menos uma semana de distancia, e o
 * resultado dependia de quando a pessoa tinha subido na balanca: quem
 * pesou no dia 15 via "-0,9 kg", quem nao pesou via "-2,2 kg", com o mesmo
 * peso hoje e o mesmo peso no comeco. Janela fixa responde sempre a mesma
 * pergunta — "e no ultimo mes?" —, e o numero de dias aparece do lado
 * porque a primeira anotacao pode ser mais nova que a janela.
 *
 * Comparar com a anotacao de ontem seria pior ainda: mediria quanta agua a
 * pessoa bebeu, nao o treino. */
function variacao(medidas, campo, janela) {
  const s = serie(medidas, campo);
  if (s.length < 2) return null;
  const fim = s[s.length - 1];
  const dentroDe = janela === undefined ? 30 : janela;

  // O mais antigo que ainda cabe na janela; se nenhum couber (todas as
  // anotacoes sao velhas), usa o mais antigo que existir.
  let inicio = null;
  for (let i = 0; i < s.length - 1; i += 1) {
    if (F.diasEntre(s[i].data, fim.data) <= dentroDe) { inicio = s[i]; break; }
  }
  if (!inicio) inicio = s[s.length - 2];

  const dias = F.diasEntre(inicio.data, fim.data);
  if (dias <= 0) return null;
  return {
    de: inicio.valor, para: fim.valor, dias: dias,
    diferenca: fim.valor - inicio.valor,
    porSemana: ((fim.valor - inicio.valor) / dias) * 7,
  };
}

/* O retrato que a tela desenha. */
function retrato(medidas, alturaCm) {
  const l = medidas || [];
  const pesoAgora = ultima(l, 'peso');
  const valorImc = pesoAgora ? imc(pesoAgora.peso, alturaCm) : null;
  return {
    peso: pesoAgora,
    cintura: ultima(l, 'cintura'),
    quadril: ultima(l, 'quadril'),
    imc: valorImc,
    faixa: faixaDoImc(valorImc),
    referencia: pesoDeReferencia(alturaCm),
    rcq: rcq(l[0]),
    variacaoPeso: variacao(l, 'peso'),
    variacaoCintura: variacao(l, 'cintura'),
    anotacoes: l.length,
  };
}

const Corpo = {
  CAMPOS, FAIXAS, anotar, apagar, normalizarMedidas, limpar, campoPorId,
  imc, faixaDoImc, pesoDeReferencia, rcq, serie, ultima, variacao, retrato,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Corpo;
else window.Corpo = Corpo;
