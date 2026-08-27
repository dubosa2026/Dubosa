/* O que ficou dos treinos: ajustes, historico, sequencia e volume.
 *
 * Tudo isso mora no aparelho, no `localStorage`. Nao existe cadastro, nao
 * existe servidor e nada sai daqui — o que tambem quer dizer que trocar de
 * celular leva junto o historico so se a pessoa exportar. A tela de
 * Ajustes diz isso com todas as letras e tem o botao de exportar.
 *
 * Este arquivo e JavaScript puro: nao toca no DOM e nao le `localStorage`
 * sozinho (quem faz isso e a interface). Assim da para conferir a
 * sequencia e o volume no node, sem navegador.
 */

/* eslint-disable no-undef */
const F = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./formato.js') : window.Formato;

/* Onde a pessoa vai treinar muda tudo: o que existe para usar e o que da
   para fazer sem incomodar. Por isso cada lugar guarda o SEU equipamento e
   a SUA regra de barulho — quem tem halter em casa nao tem halter no
   parque, e quem mora em apartamento nao pula as 6h da manha, mas pula na
   academia no mesmo dia. Um interruptor so, global, obrigava a pessoa a
   reconfigurar o app toda vez que trocasse de lugar. */
const LOCAIS_PADRAO = {
  apartamento: { equipamentos: [], semImpacto: true },
  casa: { equipamentos: [], semImpacto: false },
  academia: {
    equipamentos: ['halter', 'kettlebell', 'elastico', 'caixa', 'corda', 'barra', 'bola'],
    semImpacto: false,
  },
  'ar-livre': { equipamentos: ['elastico', 'corda'], semImpacto: false },
};

const AJUSTES_PADRAO = {
  minutos: 20,
  foco: 'corpo-todo',
  nivel: 2,
  local: 'apartamento',
  som: true,
  vibrar: true,
  telaAcesa: true,
  metaSemanal: 3,
};

function locaisNovos() {
  const l = {};
  Object.keys(LOCAIS_PADRAO).forEach((nome) => {
    l[nome] = { equipamentos: LOCAIS_PADRAO[nome].equipamentos.slice(),
      semImpacto: LOCAIS_PADRAO[nome].semImpacto };
  });
  return l;
}

function estadoNovo() {
  return {
    versao: 2,
    ajustes: Object.assign({}, AJUSTES_PADRAO, { locais: locaisNovos() }),
    historico: [],
    medidas: [],
    doDia: null,
  };
}

/* O lugar escolhido agora, ja com o equipamento e a regra de barulho dele. */
function localAtual(ajustes) {
  const a = ajustes || {};
  const nome = LOCAIS_PADRAO[a.local] ? a.local : 'apartamento';
  const guardado = (a.locais || {})[nome] || {};
  return {
    nome: nome,
    equipamentos: Array.isArray(guardado.equipamentos)
      ? guardado.equipamentos.slice() : LOCAIS_PADRAO[nome].equipamentos.slice(),
    semImpacto: guardado.semImpacto === undefined
      ? LOCAIS_PADRAO[nome].semImpacto : !!guardado.semImpacto,
  };
}

/* Le o que estava salvo sem confiar em nada: versao antiga, campo que
   sumiu, numero que virou texto. Um app que quebra ao abrir porque o
   formato mudou perde o historico inteiro da pessoa — e ela nao tem como
   recuperar. */
function normalizar(bruto) {
  const novo = estadoNovo();
  if (!bruto || typeof bruto !== 'object') return novo;

  const a = bruto.ajustes || {};
  Object.keys(AJUSTES_PADRAO).forEach((k) => {
    const padrao = AJUSTES_PADRAO[k];
    let v = a[k];
    if (v === undefined || v === null) v = padrao;
    if (typeof padrao === 'boolean') v = !!v;
    else if (typeof padrao === 'number') v = Number(v) || padrao;
    else if (Array.isArray(padrao)) v = Array.isArray(v) ? v.slice() : padrao.slice();
    novo.ajustes[k] = v;
  });
  if (!LOCAIS_PADRAO[novo.ajustes.local]) novo.ajustes.local = 'apartamento';

  // Versao 1 guardava equipamento e impacto soltos, valendo em qualquer
  // lugar. Quem ja usava o app tinha o halter marcado ali: esse halter vai
  // para casa e para o apartamento, que e onde ele de fato esta. A academia
  // fica com o padrao dela, que ja tem tudo.
  novo.ajustes.locais = locaisNovos();
  const antigosEquip = Array.isArray(a.equipamentos) ? a.equipamentos.slice() : null;
  Object.keys(novo.ajustes.locais).forEach((nome) => {
    const guardado = (a.locais || {})[nome];
    if (guardado) {
      if (Array.isArray(guardado.equipamentos)) {
        novo.ajustes.locais[nome].equipamentos = guardado.equipamentos.map(String);
      }
      if (guardado.semImpacto !== undefined) {
        novo.ajustes.locais[nome].semImpacto = !!guardado.semImpacto;
      }
    } else if (antigosEquip && (nome === 'casa' || nome === 'apartamento')) {
      novo.ajustes.locais[nome].equipamentos = antigosEquip.slice();
      if (a.semImpacto !== undefined && nome === 'apartamento') {
        novo.ajustes.locais[nome].semImpacto = !!a.semImpacto;
      }
    }
  });

  novo.ajustes.nivel = Math.min(3, Math.max(1, Math.round(novo.ajustes.nivel)));
  novo.ajustes.minutos = Math.min(90, Math.max(5, Math.round(novo.ajustes.minutos)));
  novo.ajustes.metaSemanal = Math.min(7, Math.max(1, Math.round(novo.ajustes.metaSemanal)));

  novo.historico = (Array.isArray(bruto.historico) ? bruto.historico : [])
    .filter((s) => s && s.data)
    .map((s) => ({
      id: String(s.id || (s.data + '-' + Math.random().toString(36).slice(2, 7))),
      data: String(s.data),
      quando: Number(s.quando) || 0,
      minutos: Number(s.minutos) || 0,
      esforco: Number(s.esforco) || 0,
      foco: String(s.foco || 'corpo-todo'),
      nivel: Number(s.nivel) || 2,
      local: String(s.local || 'apartamento'),
      completo: s.completo !== false,
      exercicios: Array.isArray(s.exercicios) ? s.exercicios.map(String) : [],
    }))
    .sort((x, y) => (x.data < y.data ? 1 : (x.data > y.data ? -1 : y.quando - x.quando)));

  novo.doDia = bruto.doDia && bruto.doDia.data ? bruto.doDia : null;
  return novo;
}

/* ------------------------------------------------------------------ *
 * Registrar o que foi feito                                           *
 * ------------------------------------------------------------------ */

/* Guarda a sessao. `completo` false para quem parou no meio: o treino pela
   metade continua contando para a sequencia — quem levantou, aqueceu e fez
   dois blocos treinou. Nao contar seria o app punindo justamente o dia
   dificil, que e o dia que mais precisa de credito. */
function registrar(estado, sessao) {
  const s = sessao || {};
  const nova = {
    id: String(s.id || (s.data + '-' + Date.now().toString(36))),
    data: String(s.data || F.hoje()),
    quando: Number(s.quando) || Date.now(),
    minutos: Math.max(0, Math.round(Number(s.minutos) || 0)),
    esforco: Math.max(0, Math.round(Number(s.esforco) || 0)),
    foco: String(s.foco || 'corpo-todo'),
    nivel: Number(s.nivel) || 2,
    local: String(s.local || 'apartamento'),
    completo: s.completo !== false,
    exercicios: Array.isArray(s.exercicios) ? s.exercicios.slice() : [],
  };
  const copia = Object.assign({}, estado);
  copia.historico = [nova].concat(estado.historico || []);
  return copia;
}

function apagarSessao(estado, id) {
  const copia = Object.assign({}, estado);
  copia.historico = (estado.historico || []).filter((s) => s.id !== id);
  return copia;
}

/* ------------------------------------------------------------------ *
 * As contas                                                           *
 * ------------------------------------------------------------------ */

function diasTreinados(historico) {
  const dias = {};
  (historico || []).forEach((s) => { dias[s.data] = true; });
  return dias;
}

/* Dias seguidos de treino.
 *
 * A regra que importa: o dia de HOJE ainda nao acabou. Quem treinou ontem
 * e ainda nao treinou hoje esta com a sequencia viva, nao quebrada — ela so
 * quebra quando o dia passa em branco. Contar diferente faria o app dar a
 * noticia ruim as 00h01, antes de a pessoa ter tido qualquer chance.
 */
function sequencia(historico, refIso) {
  const dias = diasTreinados(historico);
  const hoje = refIso || F.hoje();
  let inicio = hoje;
  if (!dias[hoje]) {
    const ontem = F.somarDias(hoje, -1);
    if (!dias[ontem]) return 0;
    inicio = ontem;
  }
  let n = 0;
  let dia = inicio;
  while (dias[dia]) {
    n += 1;
    dia = F.somarDias(dia, -1);
  }
  return n;
}

/* A maior sequencia que a pessoa ja teve — o recorde a bater. */
function maiorSequencia(historico) {
  const dias = Object.keys(diasTreinados(historico)).sort();
  let melhor = 0, atual = 0, anterior = null;
  dias.forEach((d) => {
    atual = (anterior && F.diasEntre(anterior, d) === 1) ? atual + 1 : 1;
    anterior = d;
    if (atual > melhor) melhor = atual;
  });
  return melhor;
}

function noPeriodo(historico, deIso, ateIso) {
  return (historico || []).filter((s) => s.data >= deIso && s.data <= ateIso);
}

/* O retrato que a tela de Historico desenha. */
function resumo(historico, refIso) {
  const hoje = refIso || F.hoje();
  const semana = noPeriodo(historico, F.inicioDaSemana(hoje), hoje);
  const mes = noPeriodo(historico, hoje.slice(0, 8) + '01', hoje);
  const soma = (l, campo) => l.reduce((s, x) => s + (Number(x[campo]) || 0), 0);

  return {
    sequencia: sequencia(historico, hoje),
    recorde: maiorSequencia(historico),
    semana: { treinos: semana.length, minutos: soma(semana, 'minutos'), esforco: soma(semana, 'esforco') },
    mes: { treinos: mes.length, minutos: soma(mes, 'minutos') },
    total: { treinos: (historico || []).length, minutos: soma(historico || [], 'minutos') },
    // O mais recente por data, e nao o primeiro da lista: quem registra
    // um treino esquecido de ontem nao pode fazer o app achar que o ultimo
    // treino foi ontem.
    ultimo: (historico || []).reduce((a, s) => (!a || s.data > a.data ? s : a), null),
  };
}

/* Os ultimos `n` dias, do mais antigo para o mais novo — o grafico de
   barrinhas da tela de Historico. */
function ultimosDias(historico, n, refIso) {
  const hoje = refIso || F.hoje();
  const porDia = {};
  (historico || []).forEach((s) => {
    porDia[s.data] = (porDia[s.data] || 0) + (Number(s.minutos) || 0);
  });
  const dias = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = F.somarDias(hoje, -i);
    dias.push({ data: d, minutos: porDia[d] || 0, treinou: !!porDia[d] });
  }
  return dias;
}

/* Os exercicios dos ultimos treinos, para o montador dar a vez a quem nao
   apareceu. Variedade nao e enfeite: musculo que nunca e estimulado de
   outro angulo para de evoluir, e treino repetido e treino abandonado. */
function recentes(historico, quantosTreinos) {
  const ids = [];
  (historico || []).slice(0, quantosTreinos || 3).forEach((s) => {
    (s.exercicios || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
  });
  return ids;
}

function maisTreinados(historico, quantos) {
  const conta = {};
  (historico || []).forEach((s) => (s.exercicios || []).forEach((id) => {
    conta[id] = (conta[id] || 0) + 1;
  }));
  return Object.keys(conta)
    .map((id) => ({ id: id, vezes: conta[id] }))
    .sort((a, b) => b.vezes - a.vezes || (a.id < b.id ? -1 : 1))
    .slice(0, quantos || 5);
}

/* A frase do topo da tela de Hoje. Curta, verdadeira e sem empolgacao
   falsa: "voce arrasou!" para quem nao treina ha duas semanas soa como
   deboche. */
function recado(historico, ajustes, refIso) {
  const r = resumo(historico, refIso);
  const meta = (ajustes && ajustes.metaSemanal) || 3;
  const hoje = refIso || F.hoje();
  const treinouHoje = (historico || []).some((s) => s.data === hoje);

  if (treinouHoje) {
    const faltam = meta - r.semana.treinos;
    return r.semana.treinos >= meta
      ? 'Meta da semana batida: ' + F.plural(r.semana.treinos, 'treino', 'treinos') + '.'
      : 'Treino de hoje feito. ' + (faltam === 1 ? 'Falta ' : 'Faltam ')
        + F.plural(faltam, 'treino', 'treinos') + ' para a meta.';
  }
  if (!(historico || []).length) return 'Primeiro treino. Comece pelo nível 1 e ajuste depois.';
  if (r.sequencia >= 2) return F.plural(r.sequencia, 'dia seguido', 'dias seguidos') + '. Hoje mantém.';
  const dias = F.diasEntre(r.ultimo.data, hoje);
  if (dias >= 10) return 'Faz ' + F.plural(dias, 'dia', 'dias') + '. Um treino curto hoje já reabre a conta.';
  if (dias >= 3) return 'Último treino ' + F.dataAmigavel(r.ultimo.data, hoje) + '. Dá para voltar hoje.';
  return r.semana.treinos >= meta
    ? 'Meta da semana já batida. O de hoje é lucro.'
    : F.plural(r.semana.treinos, 'treino', 'treinos') + ' nesta semana, meta ' + meta + '.';
}

const Progresso = {
  AJUSTES_PADRAO, LOCAIS_PADRAO, estadoNovo, normalizar, registrar, apagarSessao, localAtual,
  sequencia, maiorSequencia, resumo, ultimosDias, recentes, maisTreinados, recado,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Progresso;
else window.Progresso = Progresso;
