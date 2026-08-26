/* O nucleo: o que entrou, o que sai todo mes, e para onde isso leva.
 *
 * Nao toca na tela nem no microfone — so numero. Isso e de proposito: a
 * projecao e a unica parte do app em que um erro custa dinheiro de
 * verdade, entao ela roda tambem fora do navegador, nos testes.
 *
 * Tres ideias sustentam a projecao:
 *
 * 1. O SALDO E INFORMADO, nao adivinhado. A pessoa olha o banco e digita.
 *    A partir dai o app soma e subtrai o que ela lanca. Ninguem precisa
 *    conectar conta nenhuma — e o app tambem nao teria como.
 * 2. O QUE E FIXO E CALENDARIO, nao media. Aluguel, salario e assinatura
 *    caem em dia certo; projetar isso como "media diaria" borraria o
 *    unico pedaco do futuro que se conhece com certeza.
 * 3. O QUE E VARIAVEL E MEDIA, e a media diz de quantos dias ela veio. Uma
 *    media de tres dias de historico nao merece a mesma confianca de uma
 *    de trinta, e a tela precisa poder dizer isso.
 */

/* eslint-disable no-undef */
var F = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./formato.js') : window.Formato;

const CATEGORIAS = [
  { id: 'mercado', nome: 'Mercado', emoji: '🛒', tipo: 'saida' },
  { id: 'comida', nome: 'Comida fora', emoji: '🍽️', tipo: 'saida' },
  { id: 'transporte', nome: 'Transporte', emoji: '🚗', tipo: 'saida' },
  { id: 'moradia', nome: 'Moradia', emoji: '🏠', tipo: 'saida' },
  { id: 'contas', nome: 'Contas de casa', emoji: '💡', tipo: 'saida' },
  { id: 'saude', nome: 'Saúde', emoji: '💊', tipo: 'saida' },
  { id: 'educacao', nome: 'Educação', emoji: '📚', tipo: 'saida' },
  { id: 'lazer', nome: 'Lazer', emoji: '🎬', tipo: 'saida' },
  { id: 'assinatura', nome: 'Assinaturas', emoji: '📺', tipo: 'saida' },
  { id: 'roupa', nome: 'Roupa', emoji: '👕', tipo: 'saida' },
  { id: 'pet', nome: 'Pet', emoji: '🐾', tipo: 'saida' },
  { id: 'divida', nome: 'Dívida', emoji: '🧾', tipo: 'saida' },
  { id: 'imposto', nome: 'Imposto', emoji: '🏛️', tipo: 'saida' },
  { id: 'presente', nome: 'Presente', emoji: '🎁', tipo: 'saida' },
  { id: 'outros', nome: 'Outros', emoji: '•', tipo: 'saida' },
  { id: 'salario', nome: 'Salário', emoji: '💼', tipo: 'entrada' },
  { id: 'extra', nome: 'Renda extra', emoji: '➕', tipo: 'entrada' },
  { id: 'rendimento', nome: 'Rendimento', emoji: '📈', tipo: 'entrada' },
  { id: 'entrada', nome: 'Entrada', emoji: '↓', tipo: 'entrada' },
];

function categoria(id) {
  return CATEGORIAS.find((c) => c.id === id)
    || { id: 'outros', nome: 'Outros', emoji: '•', tipo: 'saida' };
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function estadoNovo() {
  return {
    versao: 1,
    saldo: { valor: 0, data: F.hoje(), definidoEm: 0 },
    lancamentos: [],
    fixos: [],
    dividas: [],
    ajustes: {
      reserva: 0,          // piso que a pessoa quer manter na conta
      reservaMeses: 3,     // meta de reserva de emergencia, em meses de fixo
      taxaAno: null,       // rendimento anual informado POR ELA, nunca chutado
      janelaMedia: 30,     // dias de historico que alimentam a media variavel
      falar: true,         // responder em voz alta
      pin: '',             // trava do app (opcional)
      iaSenha: '',         // senha do endereco publicado da analise por IA
      iaEndereco: '',      // vazio = /api/conselho no mesmo endereco do app
    },
  };
}

/* Estado vindo do armazenamento pode estar velho ou torto. Aqui ele volta a
   ter todos os campos, sem derrubar o app com um `undefined` no meio. */
function normalizar(bruto) {
  const base = estadoNovo();
  const e = Object.assign(base, bruto && typeof bruto === 'object' ? bruto : {});
  e.saldo = Object.assign(base.saldo, e.saldo || {});
  e.saldo.valor = Number(e.saldo.valor) || 0;
  if (!F.deISO(e.saldo.data)) e.saldo.data = F.hoje();
  e.ajustes = Object.assign(base.ajustes, e.ajustes || {});
  e.lancamentos = (Array.isArray(e.lancamentos) ? e.lancamentos : [])
    .filter((l) => l && F.deISO(l.data) && Number.isFinite(Number(l.valor)))
    .map((l) => ({
      id: l.id || novoId(),
      data: l.data,
      valor: Math.abs(Number(l.valor)),
      tipo: l.tipo === 'entrada' ? 'entrada' : 'saida',
      categoria: categoria(l.categoria).id,
      descricao: String(l.descricao || ''),
      fixoId: l.fixoId || '',
      foraDaMedia: !!l.foraDaMedia,
      origem: l.origem || 'manual',
      criadoEm: Number(l.criadoEm) || 0,
    }))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.criadoEm - a.criadoEm));
  e.fixos = (Array.isArray(e.fixos) ? e.fixos : [])
    .filter((f) => f && Number.isFinite(Number(f.valor)))
    .map((f) => ({
      id: f.id || novoId(),
      nome: String(f.nome || 'Conta fixa'),
      valor: Math.abs(Number(f.valor)),
      tipo: f.tipo === 'entrada' ? 'entrada' : 'saida',
      ciclo: ['mensal', 'semanal', 'diario'].includes(f.ciclo) ? f.ciclo : 'mensal',
      dia: Math.min(31, Math.max(1, Number(f.dia) || 1)),
      diaSemana: Math.min(6, Math.max(0, Number(f.diaSemana) || 0)),
      inicio: F.deISO(f.inicio) ? f.inicio : '',
      fim: F.deISO(f.fim) ? f.fim : '',
      categoria: categoria(f.categoria).id,
      dividaId: f.dividaId || '',
      ativo: f.ativo !== false,
    }));
  e.dividas = (Array.isArray(e.dividas) ? e.dividas : [])
    .filter((d) => d && Number.isFinite(Number(d.saldo)))
    .map((d) => ({
      id: d.id || novoId(),
      nome: String(d.nome || 'Dívida'),
      saldo: Math.abs(Number(d.saldo)),
      jurosMes: Math.max(0, Number(d.jurosMes) || 0),
      parcela: Math.max(0, Number(d.parcela) || 0),
    }));
  return e;
}

/* ------------------------------------------------------------------ *
 * Saldo                                                               *
 * ------------------------------------------------------------------ */

/* O saldo informado vale para o INSTANTE em que foi informado. Por isso o
   lancamento do mesmo dia so entra na conta se foi criado depois disso: o
   cafe que voce pagou de manha ja estava descontado no extrato que voce
   olhou ao meio-dia. Lancamento de data anterior nunca entra — o banco ja
   sabe dele. */
function saldoEm(estado, ate) {
  const ref = ate || F.hoje();
  let s = Number(estado.saldo.valor) || 0;
  const marco = Number(estado.saldo.definidoEm) || 0;
  for (const l of estado.lancamentos) {
    if (l.data > ref) continue;
    if (l.data < estado.saldo.data) continue;
    if (l.data === estado.saldo.data && (Number(l.criadoEm) || 0) <= marco) continue;
    s += l.tipo === 'entrada' ? l.valor : -l.valor;
  }
  return arredondar(s);
}

function arredondar(v) { return Math.round((Number(v) || 0) * 100) / 100; }

/* ------------------------------------------------------------------ *
 * Contas fixas viram datas no calendario                              *
 * ------------------------------------------------------------------ */

/* Todas as ocorrencias de um fixo dentro do intervalo, ja pulando as que
   ja foram lancadas. Sem essa checagem o aluguel pago no dia 10 apareceria
   duas vezes na projecao do mes: uma como lancamento, outra como previsao. */
function ocorrencias(estado, de, ate) {
  const fora = [];
  const dias = F.diasEntre(de, ate);
  if (dias < 0) return fora;

  for (const f of estado.fixos) {
    if (!f.ativo) continue;
    const inicio = f.inicio && f.inicio > de ? f.inicio : de;
    const fim = f.fim && f.fim < ate ? f.fim : ate;
    if (F.diasEntre(inicio, fim) < 0) continue;

    if (f.ciclo === 'diario') {
      for (let d = inicio; d <= fim; d = F.somarDias(d, 1)) {
        fora.push(ocorrencia(f, d));
      }
    } else if (f.ciclo === 'semanal') {
      for (let d = inicio; d <= fim; d = F.somarDias(d, 1)) {
        if (F.diaSemana(d) === f.diaSemana) fora.push(ocorrencia(f, d));
      }
    } else {
      // Mensal: o dia 31 num mes de 30 cai no ultimo dia, como o boleto faz.
      let cursor = inicio;
      while (cursor <= fim) {
        const d = new Date(F.deISO(cursor).getFullYear(), F.deISO(cursor).getMonth(), 1);
        const ultimo = F.diasNoMes(d.getFullYear(), d.getMonth() + 1);
        const data = F.diaISO(new Date(d.getFullYear(), d.getMonth(), Math.min(f.dia, ultimo)));
        if (data >= inicio && data <= fim) fora.push(ocorrencia(f, data));
        cursor = F.somarMeses(F.diaISO(new Date(d.getFullYear(), d.getMonth(), 1)), 1);
      }
    }
  }

  return fora
    .filter((o) => !jaLancado(estado, o))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

function ocorrencia(f, data) {
  return {
    data, valor: f.valor, tipo: f.tipo, nome: f.nome,
    categoria: f.categoria, fixoId: f.id, ciclo: f.ciclo,
  };
}

/* Ja foi pago? Para conta mensal, basta ter um lancamento do mesmo fixo no
   mesmo mes; para semanal, na mesma semana; para diaria, no mesmo dia. */
function jaLancado(estado, o) {
  return estado.lancamentos.some((l) => {
    if (l.fixoId !== o.fixoId) return false;
    if (o.ciclo === 'diario') return l.data === o.data;
    if (o.ciclo === 'semanal') return Math.abs(F.diasEntre(l.data, o.data)) < 7;
    return l.data.slice(0, 7) === o.data.slice(0, 7);
  });
}

/* ------------------------------------------------------------------ *
 * O gasto variavel: a media que sustenta a projecao                   *
 * ------------------------------------------------------------------ */

/* Media diaria do que NAO e conta fixa, na janela dos ultimos N dias.
 *
 * O divisor e o numero de dias observados, nao o numero de dias com gasto:
 * quem passa tres dias sem gastar tem media menor, e e isso mesmo. Mas o
 * divisor tambem nao passa do historico que existe — quem usa o app ha
 * dois dias nao tem media de trinta. */
function mediaVariavel(estado, ref, janela) {
  const fim = ref || F.hoje();
  const dias = Math.max(1, Number(janela) || estado.ajustes.janelaMedia || 30);
  const inicio = F.somarDias(fim, -(dias - 1));

  const usados = estado.lancamentos.filter(
    (l) => l.tipo === 'saida' && !l.fixoId && !l.foraDaMedia && l.data >= inicio && l.data <= fim,
  );
  const primeiro = estado.lancamentos.length
    ? estado.lancamentos[estado.lancamentos.length - 1].data : fim;
  const observados = Math.max(1, Math.min(dias, F.diasEntre(primeiro, fim) + 1));
  const total = usados.reduce((s, l) => s + l.valor, 0);

  return {
    media: arredondar(total / observados),
    total: arredondar(total),
    dias: observados,
    lancamentos: usados.length,
    // Uma media de menos de uma semana ainda e palpite. A tela avisa.
    confianca: observados >= 21 ? 'alta' : observados >= 7 ? 'media' : 'baixa',
  };
}

function gastoVariavelDoDia(estado, dia) {
  const d = dia || F.hoje();
  return arredondar(estado.lancamentos
    .filter((l) => l.data === d && l.tipo === 'saida' && !l.fixoId)
    .reduce((s, l) => s + l.valor, 0));
}

/* ------------------------------------------------------------------ *
 * Projecao                                                            *
 * ------------------------------------------------------------------ */

/* Caminha dia a dia de hoje ate `ate`, somando o que e certo (fixos) e
   descontando o que e provavel (media). Devolve a serie inteira porque o
   grafico da tela e a resposta em si: importa mais QUANDO o saldo fura o
   chao do que o numero do ultimo dia. */
function projetar(estado, ate, opcoes) {
  const o = opcoes || {};
  const inicio = o.de || F.hoje();
  const fimIso = ate;
  const dias = Math.max(0, F.diasEntre(inicio, fimIso));
  const mv = mediaVariavel(estado, inicio);
  const mediaDia = o.mediaDia != null ? o.mediaDia : mv.media;

  let saldo = saldoEm(estado, inicio);
  const inicial = saldo;
  const eventos = ocorrencias(estado, F.somarDias(inicio, 1), fimIso);
  const porDia = new Map();
  for (const ev of eventos) {
    if (!porDia.has(ev.data)) porDia.set(ev.data, []);
    porDia.get(ev.data).push(ev);
  }

  // Hoje ja rendeu gasto? Entao o que sobra de "media" para hoje e o
  // que falta ate a media — nunca negativo, senao o dia gastado viraria
  // credito no futuro.
  const gastoHoje = gastoVariavelDoDia(estado, inicio);
  const restoDeHoje = Math.max(0, mediaDia - gastoHoje);

  let entradas = 0, saidasFixas = 0, saidasVariaveis = 0;
  // Um ponto por dia, e o ponto e o saldo NO FIM daquele dia. Ja houve aqui
  // um ponto extra no comeco, com o saldo de agora: como o eixo x anda por
  // indice, dois pontos na mesma data viravam um degrau reto ocupando um
  // dia inteiro de largura no grafico, dizendo que nada acontecia.
  const serie = [];
  let piorDia = null;

  for (let i = 0; i <= dias; i++) {
    const d = F.somarDias(inicio, i);
    if (i > 0) {
      for (const ev of (porDia.get(d) || [])) {
        if (ev.tipo === 'entrada') { saldo += ev.valor; entradas += ev.valor; }
        else { saldo -= ev.valor; saidasFixas += ev.valor; }
      }
    }
    const variavel = i === 0 ? restoDeHoje : mediaDia;
    saldo -= variavel;
    saidasVariaveis += variavel;
    if (!piorDia || saldo < piorDia.saldo) piorDia = { data: d, saldo: arredondar(saldo) };
    serie.push({ data: d, saldo: arredondar(saldo), evento: (porDia.get(d) || [])[0] || null });
  }

  const zeraEm = serie.find((p) => p.saldo < 0);

  return {
    de: inicio,
    ate: fimIso,
    dias,
    saldoInicial: arredondar(inicial),
    saldoFinal: arredondar(saldo),
    entradas: arredondar(entradas),
    saidasFixas: arredondar(saidasFixas),
    saidasVariaveis: arredondar(saidasVariaveis),
    mediaDia: arredondar(mediaDia),
    confianca: mv.confianca,
    diasDeHistorico: mv.dias,
    serie,
    piorDia,
    zeraEm: zeraEm ? zeraEm.data : null,
    eventos,
  };
}

/* Os quatro horizontes que a tela mostra. Sempre os mesmos, sempre na
   mesma ordem: dia, semana, mes, ano. */
function horizontes(estado, ref) {
  const hoje = ref || F.hoje();
  return {
    dia: projetar(estado, hoje),
    semana: projetar(estado, F.somarDias(hoje, 6)),
    mes: projetar(estado, F.fimDoMes(hoje)),
    ano: projetar(estado, F.somarDias(hoje, 364)),
  };
}

/* ------------------------------------------------------------------ *
 * Quanto posso gastar hoje                                            *
 * ------------------------------------------------------------------ */

/* A pergunta que o app existe para responder.
 *
 *   (o que tenho + o que ainda entra − o que ainda sai de fixo − a reserva)
 *   ---------------------------------------------------------------------
 *                       dias ate o dinheiro ser reposto
 *
 * O divisor NAO e "dias que faltam no mes". Fosse assim, dia 28 o app
 * mandaria torrar tudo em quatro dias e no dia 2 a pessoa estaria no
 * vermelho esperando o salario do dia 5. O que importa e quantos dias
 * faltam ate a proxima entrada — o dinheiro na conta precisa durar ate la.
 * Quando a proxima entrada cai antes do fim do mes, vale o fim do mes: e o
 * horizonte mais longo dos dois que manda, para o teto nunca ser otimista.
 *
 * Nao entra media nenhuma nesta conta: media e para prever o futuro, e este
 * numero e um limite, nao uma previsao. */
function limiteDoDia(estado, ref) {
  const hoje = ref || F.hoje();
  const fimMes = F.fimDoMes(hoje);

  const adiante = ocorrencias(estado, F.somarDias(hoje, 1), F.somarDias(hoje, 70));
  const proxima = adiante.find((e) => e.tipo === 'entrada') || null;
  let ate = fimMes;
  if (proxima) {
    const vespera = F.somarDias(proxima.data, -1);
    if (vespera > ate) ate = vespera;
  }
  // Teto duro: uma entrada anual (13o, restituicao) nao pode esticar a
  // janela para meio ano e fazer o limite do dia virar trocado.
  if (F.diasEntre(hoje, ate) > 45) ate = F.somarDias(hoje, 45);

  const diasRestantes = Math.max(1, F.diasEntre(hoje, ate) + 1);
  const saldo = saldoEm(estado, hoje);
  const evs = ocorrencias(estado, F.somarDias(hoje, 1), ate);

  let entram = 0, saem = 0;
  for (const e of evs) {
    if (e.tipo === 'entrada') entram += e.valor; else saem += e.valor;
  }
  const reserva = Math.max(0, Number(estado.ajustes.reserva) || 0);
  const disponivel = saldo + entram - saem - reserva;
  const limite = disponivel / diasRestantes;
  const gasto = gastoVariavelDoDia(estado, hoje);

  return {
    dia: hoje,
    ate,
    limite: arredondar(limite),
    gasto,
    resta: arredondar(limite - gasto),
    disponivel: arredondar(disponivel),
    diasRestantes,
    saldo,
    entram: arredondar(entram),
    saem: arredondar(saem),
    reserva,
    proxima,
    apertado: limite <= 0,
  };
}

/* ------------------------------------------------------------------ *
 * Recortes para as telas e para os conselhos                          *
 * ------------------------------------------------------------------ */
function porCategoria(estado, de, ate, tipo) {
  const mapa = new Map();
  for (const l of estado.lancamentos) {
    if (l.data < de || l.data > ate) continue;
    if (tipo && l.tipo !== tipo) continue;
    const c = mapa.get(l.categoria) || { id: l.categoria, total: 0, n: 0 };
    c.total += l.valor; c.n += 1;
    mapa.set(l.categoria, c);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, total: arredondar(c.total), ...categoria(c.id) }))
    .sort((a, b) => b.total - a.total);
}

/* Quanto de fixo por mes — a conta que decide se a vida cabe no salario. */
function mensalFixo(estado) {
  let entra = 0, sai = 0;
  for (const f of estado.fixos) {
    if (!f.ativo) continue;
    const porMes = f.ciclo === 'mensal' ? f.valor
      : f.ciclo === 'semanal' ? f.valor * 52 / 12
        : f.valor * 365 / 12;
    if (f.tipo === 'entrada') entra += porMes; else sai += porMes;
  }
  return { entra: arredondar(entra), sai: arredondar(sai), sobra: arredondar(entra - sai) };
}

/* Sobra media do mes ja contando o gasto variavel observado. E o numero que
   diz se da para investir — e quanto. */
function sobraMensal(estado, ref) {
  const fixo = mensalFixo(estado);
  const mv = mediaVariavel(estado, ref || F.hoje());
  return {
    entra: fixo.entra,
    saiFixo: fixo.sai,
    saiVariavel: arredondar(mv.media * 30.4),
    sobra: arredondar(fixo.entra - fixo.sai - mv.media * 30.4),
    confianca: mv.confianca,
  };
}

/* ------------------------------------------------------------------ *
 * Render: simulacao de juros compostos                                *
 * ------------------------------------------------------------------ */

/* A taxa vem da pessoa, sempre. O app nao sabe quanto rende o CDI hoje e
   nao vai inventar: chutar 1% ao mes numa tela de dinheiro e mentira com
   cara de numero. Sem taxa informada, a simulacao nao aparece. */
function simularRendimento(aporteMensal, taxaAno, meses, inicial) {
  const a = Math.max(0, Number(aporteMensal) || 0);
  const t = Number(taxaAno);
  if (!Number.isFinite(t) || t <= 0) return null;
  const i = Math.pow(1 + t, 1 / 12) - 1;
  const n = Math.max(1, Math.round(meses));
  let saldo = Math.max(0, Number(inicial) || 0);
  const serie = [];
  for (let m = 1; m <= n; m++) {
    saldo = saldo * (1 + i) + a;
    serie.push({ mes: m, saldo: arredondar(saldo) });
  }
  const aportado = (Number(inicial) || 0) + a * n;
  return {
    taxaAno: t, taxaMes: i, meses: n,
    saldo: arredondar(saldo),
    aportado: arredondar(aportado),
    juros: arredondar(saldo - aportado),
    serie,
  };
}

/* Quitacao de divida pelo metodo avalanche: paga primeiro a de juro maior,
   que e o que economiza mais dinheiro (nao o que economiza mais tempo). */
function planoDividas(dividas, sobraMes) {
  const lista = (dividas || []).filter((d) => d.saldo > 0)
    .map((d) => ({ ...d }))
    .sort((a, b) => b.jurosMes - a.jurosMes);
  if (!lista.length) return null;

  const total = arredondar(lista.reduce((s, d) => s + d.saldo, 0));
  const jurosMes = arredondar(lista.reduce((s, d) => s + d.saldo * d.jurosMes, 0));
  const parcelas = arredondar(lista.reduce((s, d) => s + d.parcela, 0));
  const extra = Math.max(0, arredondar((Number(sobraMes) || 0)));

  // Quanto tempo para zerar pagando parcela + sobra, sempre jogando o extra
  // na de maior juro. Trava em 600 meses para nao girar para sempre quando
  // o pagamento nao cobre nem o juro.
  let meses = 0, jurosPagos = 0;
  const saldos = lista.map((d) => ({ ...d }));
  while (saldos.some((d) => d.saldo > 0.01) && meses < 600) {
    meses++;
    let disponivel = extra;
    for (const d of saldos) {
      if (d.saldo <= 0) continue;
      const j = d.saldo * d.jurosMes;
      jurosPagos += j;
      d.saldo += j;
      const pago = Math.min(d.saldo, d.parcela);
      d.saldo -= pago;
    }
    for (const d of saldos) {
      if (disponivel <= 0) break;
      if (d.saldo <= 0) continue;
      const pago = Math.min(d.saldo, disponivel);
      d.saldo -= pago; disponivel -= pago;
    }
  }

  return {
    total, jurosMes, parcelas,
    alvo: lista[0],
    ordem: lista,
    meses: meses >= 600 ? null : meses,
    jurosPagos: arredondar(jurosPagos),
    naoFecha: meses >= 600,
  };
}

const Nucleo = {
  CATEGORIAS, categoria, novoId, estadoNovo, normalizar, arredondar,
  saldoEm, ocorrencias, jaLancado, mediaVariavel, gastoVariavelDoDia,
  projetar, horizontes, limiteDoDia, porCategoria, mensalFixo, sobraMensal,
  simularRendimento, planoDividas,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Nucleo;
else window.Nucleo = Nucleo;
