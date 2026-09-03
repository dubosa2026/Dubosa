/**
 * Testes do núcleo. Executar com: node tests/run.js
 *
 * Cobrem o que não pode quebrar em silêncio: o relógio comercial, as regras de
 * ranking, a projeção e — principalmente — as três barreiras de privacidade.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as clock from '../src/core/clock.js';
const { toMinutes } = clock;
import * as metrics from '../src/core/metrics.js';
import * as ranking from '../src/core/ranking.js';
import * as access from '../src/core/access.js';
import * as gamification from '../src/core/gamification.js';
import { buildDayState, emptyDayState, valueAt } from '../src/data/store.js';
import { toRecords, normalizeMoney } from '../src/data/types.js';
import { indexTeam, resolveSeller, teamFromLines } from '../src/core/team.js';
import { mergeTeam } from '../src/data/store.js';
import { PendingSource } from '../src/data/sources/PendingSource.js';
import { DemoSource } from '../src/data/sources/DemoSource.js';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, '..', 'config', 'app.config.json'), 'utf8'));

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FALHA ${name}\n       ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'condição falsa');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg ?? ''} esperado ${expected}, obtido ${actual}`);
}

function assertClose(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg ?? ''} esperado ~${expected}, obtido ${actual}`);
}

// ---------------------------------------------------------------- fixtures
const DATE = '2026-09-03';
const YESTERDAY = '2026-09-02';

function makeDay(date, rows) {
  const records = [];
  for (const [name, points] of Object.entries(rows)) {
    for (const [time, orders, revenue] of points) {
      records.push({
        sellerId: name.toLowerCase(), sellerName: name, date, time, orders, revenue,
      });
    }
  }
  return buildDayState({ status: 'ready', records, semantics: 'cumulative', date, meta: {} });
}

const today = makeDay(DATE, {
  'Joao Pedro': [['08:30', 2, 18000], ['11:00', 7, 61000], ['14:00', 12, 98000]],
  'Mariana Costa': [['08:30', 3, 26000], ['11:00', 8, 70000], ['14:00', 10, 106500]],
  'Rafael Nogueira': [['08:30', 0, 0], ['11:00', 3, 24000], ['14:00', 6, 52000]],
  'Beatriz Lima': [['08:30', 1, 9000], ['11:00', 2, 15000], ['14:00', 2, 15000]],
  'Diego Fontana': [['08:30', 0, 0], ['11:00', 0, 0], ['14:00', 0, 0]],
});

const yesterday = makeDay(YESTERDAY, {
  'Joao Pedro': [['08:30', 1, 8000], ['11:00', 5, 40000], ['14:00', 9, 72000], ['18:00', 16, 130000]],
  'Mariana Costa': [['08:30', 2, 20000], ['11:00', 6, 55000], ['14:00', 9, 88000], ['18:00', 14, 140000]],
  'Rafael Nogueira': [['14:00', 5, 44000], ['18:00', 9, 80000]],
  'Beatriz Lima': [['14:00', 4, 31000], ['18:00', 7, 58000]],
  'Diego Fontana': [['14:00', 1, 6000], ['18:00', 3, 19000]],
});

const AT = clock.toMinutes('14:00');

// ------------------------------------------------------------------ relógio
console.log('\nRELÓGIO COMERCIAL');
await check('expediente desconta o intervalo', () => {
  assertEqual(clock.totalBusinessMinutes(config.businessHours), 540);
});
await check('decorrido às 14h ignora o almoço', () => {
  assertEqual(clock.elapsedBusinessMinutes(config.businessHours, AT), 300);
});
await check('dia útil anterior pula fim de semana', () => {
  assertEqual(clock.previousBusinessDay('2026-09-07', config.businessHours), '2026-09-04');
});
await check('feriado configurado é pulado', () => {
  const bh = { ...config.businessHours, holidays: ['2026-09-07'] };
  assertEqual(clock.previousBusinessDay('2026-09-08', bh), '2026-09-04');
});
await check('fase do dia', () => {
  assertEqual(clock.dayPhase(config.businessHours, clock.toMinutes('12:30')), 'intervalo');
  assertEqual(clock.dayPhase(config.businessHours, clock.toMinutes('19:00')), 'encerrado');
  assertEqual(clock.dayPhase(config.businessHours, clock.toMinutes('07:00')), 'antes');
});

// ---------------------------------------------------------------- importação
console.log('\nCONTRATO DE IMPORTAÇÃO');
await check('aceita formatos brasileiros e reporta linhas inválidas', () => {
  const { records, errors } = toRecords([
    { Nome: 'João', Data: '03/09/2026', 'Horário': '14h00', Pedidos: '12', Faturamento: 'R$ 98.000,00' },
    { Nome: 'Ana', Data: '2026-09-03', Hora: 0.5, Pedidos: 9, Faturamento: 72000 },
    { Nome: 'Erro', Data: 'xx', Hora: '10:00', Pedidos: 1, Faturamento: 1 },
  ]);
  assertEqual(records.length, 2);
  assertEqual(records[0].revenue, 98000);
  assertEqual(records[1].time, '12:00');
  assertEqual(errors.length, 1);
  assertEqual(errors[0].field, 'date');
});

// ------------------------------------------------------------------- store
console.log('\nLINHA DO TEMPO');
await check('acumulado nunca anda para trás', () => {
  const noisy = buildDayState({
    status: 'ready',
    semantics: 'cumulative',
    date: DATE,
    records: [
      { sellerId: 'x', sellerName: 'X', date: DATE, time: '09:00', orders: 5, revenue: 50000 },
      { sellerId: 'x', sellerName: 'X', date: DATE, time: '10:00', orders: 3, revenue: 30000 },
    ],
    meta: {},
  });
  assertEqual(noisy.sellers[0].revenue, 50000);
});
await check('valueAt é degrau, não interpola', () => {
  const t = today.sellers.find((s) => s.sellerId === 'joao pedro').timeline;
  assertEqual(valueAt(t, clock.toMinutes('12:00')).revenue, 61000);
  assertEqual(valueAt(t, clock.toMinutes('08:00')).revenue, 0);
});
await check('registros incrementais são somados', () => {
  const inc = buildDayState({
    status: 'ready',
    semantics: 'incremental',
    date: DATE,
    records: [
      { sellerId: 'y', sellerName: 'Y', date: DATE, time: '09:00', orders: 1, revenue: 10000 },
      { sellerId: 'y', sellerName: 'Y', date: DATE, time: '10:00', orders: 2, revenue: 25000 },
    ],
    meta: {},
  });
  assertEqual(inc.sellers[0].orders, 3);
  assertEqual(inc.sellers[0].revenue, 35000);
});

// ------------------------------------------------------------------ ranking
console.log('\nRANKING');
const ranked = ranking.rankAt(today, AT, config.ranking);
await check('critério principal é o faturamento do dia', () => {
  assertEqual(ranked[0].sellerName, 'Mariana Costa');
  assertEqual(ranked[1].sellerName, 'Joao Pedro');
});
await check('quem não produziu fica por último, mas continua no ranking', () => {
  assertEqual(ranked.at(-1).sellerName, 'Diego Fontana');
  assertEqual(ranked.length, 5);
});
await check('distância para a próxima posição é magnitude correta', () => {
  const g = ranking.gapsFor(ranked, 'joao pedro');
  assertEqual(g.position, 2);
  assertEqual(g.toNext.revenue, 8500);
});
await check('empate é desempatado de forma determinística', () => {
  const tie = makeDay(DATE, { Ana: [['14:00', 5, 50000]], Bruno: [['14:00', 5, 50000]] });
  const r1 = ranking.rankAt(tie, AT, config.ranking).map((e) => e.sellerName);
  const r2 = ranking.rankAt(tie, AT, config.ranking).map((e) => e.sellerName);
  assertEqual(r1.join('>'), r2.join('>'));
  assertEqual(r1[0], 'Ana');
});

// ---------------------------------------------------------------- projeções
console.log('\nRITMO E PROJEÇÃO');
await check('exemplo da especificação: +3 pedidos, +R$ 26.000, +36,1%', () => {
  const p = metrics.buildPerformance({
    orders: 12, revenue: 98000,
    ordersYesterdaySameTime: 9, revenueYesterdaySameTime: 72000,
    ordersYesterdayTotal: 16, revenueYesterdayTotal: 130000,
    atMinutes: AT, businessHours: config.businessHours,
    projectionConfig: config.projection, goals: config.goals,
  });
  assertEqual(p.vsYesterdaySameTime.orders.abs, 3);
  assertEqual(p.vsYesterdaySameTime.revenue.abs, 26000);
  assertClose(p.vsYesterdaySameTime.revenue.pct * 100, 36.1, 0.05);
});
await check('sem expediente decorrido suficiente não há projeção', () => {
  const p = metrics.project({
    current: 1, elapsedMinutes: 10, remainingMinutes: 530, config: config.projection,
  });
  assertEqual(p.value, null);
  assertEqual(p.model, 'aguardando');
});
await check('projeção nunca fica abaixo do realizado', () => {
  const p = metrics.project({
    current: 100000, elapsedMinutes: 500, remainingMinutes: 40, curveFraction: 0.99, config: config.projection,
  });
  assert(p.value >= 100000);
});
await check('projeção é limitada pelo multiplicador máximo', () => {
  const p = metrics.project({
    current: 5000, elapsedMinutes: 35, remainingMinutes: 505, curveFraction: 0.02, config: config.projection,
  });
  assert(p.value <= 5000 * config.projection.maxMultiplier);
});
await check('variação percentual sobre base zero é indefinida, não infinita', () => {
  assertEqual(metrics.compare(1000, 0).pct, null);
});

// -------------------------------------------------------------- gamificação
console.log('\nGAMIFICAÇÃO');
await check('nível respeita faturamento e piso de pedidos', () => {
  assertEqual(gamification.tierFor(20, 210000, config.tiers).current.name, 'ELITE');
  assertEqual(gamification.tierFor(2, 210000, config.tiers).current.name, 'BRONZE');
});
await check('sem histórico não se afirma recorde', () => {
  const list = gamification.evaluateAchievements({
    sellerDay: { timeline: [], firstOrderMinutes: null, lastMinutes: null },
    performance: { orders: 99, revenue: 999999, pace: { revenueStatus: { status: 'acima', ratio: 3 } }, vsYesterdaySameTime: { revenue: { abs: 0 } } },
    positions: { opening: 1, current: 1 },
    history: {}, config: config.achievements, goals: config.goals,
  });
  assert(!list.find((a) => a.id === 'recorde-pedidos').unlocked);
});

// ---------------------------------------------------------- CADASTRO EQUIPE
console.log('\nCADASTRO DA EQUIPE');
const TEAM = teamFromLines([
  'ALISSON DOS SANTOS RIBEIRO;AC',
  'ERICA OLIVEIRA;TO',
  'MURILO BEDANI ROGERIO;TO',
  'MARIA PAULA BERTAGLIA NESTOR;TO',
].join('\n'));
const TEAM_INDEX = indexTeam(TEAM);

await check('lista colada vira cadastro com nome normalizado', () => {
  assertEqual(TEAM.vendedores.length, 4);
  assertEqual(TEAM.vendedores[0].name, 'Alisson dos Santos Ribeiro');
  assertEqual(TEAM.vendedores[0].uf, 'AC');
});

const soQuemProduziu = buildDayState({
  status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
  records: [
    { sellerId: 'a', sellerName: 'ALISSON DOS SANTOS RIBEIRO', date: DATE, time: '14:00', orders: 5, revenue: 50000 },
    { sellerId: 'b', sellerName: 'Erica Oliveira', date: DATE, time: '14:00', orders: 3, revenue: 31000 },
    { sellerId: 'c', sellerName: 'VISITANTE NAO CADASTRADO', date: DATE, time: '14:00', orders: 1, revenue: 4000 },
  ],
});

await check('a base traz só quem produziu — antes da fusão faltam vendedores', () => {
  assertEqual(soQuemProduziu.sellers.length, 3);
});

const completo = mergeTeam(soQuemProduziu, TEAM_INDEX, resolveSeller);

await check('quem está zerado aparece no ranking, vindo do cadastro', () => {
  assertEqual(completo.sellers.length, 5);
  const murilo = completo.sellers.find((s) => s.sellerId === 'murilo-bedani-rogerio');
  assert(murilo, 'vendedor zerado sumiu do dia');
  assertEqual(murilo.revenue, 0);
  assertEqual(murilo.semProducaoNaBase, true);
});

await check('vendedor zerado fica nas últimas posições, não fora do ranking', () => {
  const r = ranking.rankAt(completo, AT, config.ranking);
  assertEqual(r.length, 5);
  assertEqual(r[0].sellerName, 'Alisson dos Santos Ribeiro');
  assert(r.at(-1).semProducao, 'a última posição deveria ser de quem não produziu');
  assert(r.some((e) => e.sellerId === 'maria-paula-bertaglia-nestor'));
});

await check('nome em caixa alta na base casa com o cadastro', () => {
  const alisson = completo.sellers.find((s) => s.sellerId === 'alisson-dos-santos-ribeiro');
  assertEqual(alisson.sellerName, 'Alisson dos Santos Ribeiro');
  assertEqual(alisson.revenue, 50000);
});

await check('nome fora do cadastro é assinalado, nunca descartado', () => {
  assertEqual(completo.foraDoCadastro.length, 1);
  assert(completo.sellers.some((s) => s.foraDoCadastro));
});

await check('cadastro vazio não altera o dia', () => {
  const intocado = mergeTeam(soQuemProduziu, indexTeam({ vendedores: [] }), resolveSeller);
  assertEqual(intocado.sellers.length, 3);
});

// ----------------------------------------------------------- PRIVACIDADE 🔒
console.log('\nPRIVACIDADE — REGRA ESTRUTURAL');
const sellerView = access.buildSellerView({
  today, yesterday, sellerId: 'joao pedro', sellerName: 'Joao Pedro', atMinutes: AT, config,
});

await check('vendedor vê a própria posição', () => {
  assertEqual(sellerView.gaps.position, 2);
  assertEqual(sellerView.performance.revenue, 98000);
});
await check('vendedor vê a distância para a próxima posição', () => {
  assertEqual(sellerView.gaps.toNext.revenue, 8500);
});
await check('painel do vendedor NÃO contém nome de nenhum colega', () => {
  const blob = JSON.stringify(sellerView).toLowerCase();
  for (const other of ['mariana', 'rafael', 'beatriz', 'diego', 'costa', 'nogueira', 'lima', 'fontana']) {
    assert(!blob.includes(other), `vazou "${other}"`);
  }
});
await check('painel do vendedor NÃO contém faturamento de colega', () => {
  const blob = JSON.stringify(sellerView);
  for (const value of ['106500', '52000', '15000']) {
    assert(!blob.includes(value), `vazou o valor ${value}`);
  }
});
await check('sobrenome compartilhado não é falso alarme', () => {
  // Caso real da equipe: "Leonardo Costa Oliveira" e "Erica Oliveira".
  const equipe = [
    { sellerId: 'leonardo-costa-oliveira', sellerName: 'Leonardo Costa Oliveira' },
    { sellerId: 'erica-oliveira', sellerName: 'Erica Oliveira' },
    { sellerId: 'cristiane-luis-dos-santos', sellerName: 'Cristiane Luis dos Santos' },
  ];
  // O próprio nome do vendedor aparece no painel dele — isso não é vazamento.
  access.assertSellerViewModelIsClean(
    { identity: { sellerName: 'Leonardo Costa Oliveira' } }, 'leonardo-costa-oliveira', equipe,
  );
});
await check('termo exclusivo de um colega ainda é bloqueado', () => {
  const equipe = [
    { sellerId: 'leonardo-costa-oliveira', sellerName: 'Leonardo Costa Oliveira' },
    { sellerId: 'erica-oliveira', sellerName: 'Erica Oliveira' },
  ];
  let threw = false;
  try {
    access.assertSellerViewModelIsClean(
      { texto: 'a Erica passou você' }, 'leonardo-costa-oliveira', equipe,
    );
  } catch { threw = true; }
  assert(threw, 'deixou passar o primeiro nome exclusivo de uma colega');
});
await check('nome completo de colega é sempre bloqueado', () => {
  const equipe = [
    { sellerId: 'a', sellerName: 'Maria Silva' },
    { sellerId: 'b', sellerName: 'Joana Silva' },
    { sellerId: 'c', sellerName: 'Pedro Silva' },
  ];
  let threw = false;
  try {
    access.assertSellerViewModelIsClean({ t: 'Joana Silva lidera' }, 'a', equipe);
  } catch { threw = true; }
  assert(threw, 'nome completo de colega passou pela varredura');
});
await check('a varredura derruba um painel contaminado', () => {
  let threw = false;
  try {
    access.assertSellerViewModelIsClean(
      { qualquerCampo: 'Mariana Costa liderou' }, 'joao pedro', today.sellers,
    );
  } catch { threw = true; }
  assert(threw, 'a varredura deixou passar um nome de terceiro');
});
await check('view model do vendedor é imutável', () => {
  let threw = false;
  try { 'use strict'; sellerView.performance.revenue = 1; } catch { threw = true; }
  assert(threw || sellerView.performance.revenue === 98000);
});
await check('vendedor não pode ver ranking nominal, equipe nem exportar', () => {
  for (const cap of [
    access.CAPABILITY.VIEW_NOMINAL_RANKING,
    access.CAPABILITY.VIEW_TEAM_ROSTER,
    access.CAPABILITY.VIEW_OTHER_SELLER,
    access.CAPABILITY.COMPARE_SELLERS,
    access.CAPABILITY.EXPORT_REPORTS,
    access.CAPABILITY.CONFIGURE_APP,
    access.CAPABILITY.MANAGE_ACCESS,
  ]) {
    assert(!access.can(access.ROLE.SELLER, cap, config), `vendedor recebeu "${cap}"`);
    assert(access.can(access.ROLE.MANAGER, cap, config), `gestor perdeu "${cap}"`);
  }
});
await check('agregado da equipe some quando a equipe é pequena demais', () => {
  const small = makeDay(DATE, { Ana: [['14:00', 5, 50000]], Bruno: [['14:00', 4, 40000]] });
  const v = access.buildSellerView({
    today: small, yesterday: null, sellerId: 'ana', sellerName: 'Ana', atMinutes: AT, config,
  });
  assertEqual(v.team.visible, false);
  assertEqual(v.team.reason, 'equipe-pequena');
});
await check('agregado aparece com equipe suficiente e só traz somas', () => {
  assertEqual(sellerView.team.visible, true);
  assertEqual(sellerView.team.revenue, 98000 + 106500 + 52000 + 15000 + 0);
  assert(sellerView.team.sellerCount === 5);
  assert(!('rows' in sellerView.team) && !('sellers' in sellerView.team));
});
await check('mensagens nunca citam terceiros', () => {
  for (const msg of sellerView.messages) {
    for (const other of ['Mariana', 'Rafael', 'Beatriz', 'Diego']) {
      assert(!msg.text.includes(other), `mensagem vazou "${other}": ${msg.text}`);
    }
  }
});

await check('vendedor zerado NÃO é confundido com base desconectada', () => {
  // O vendedor sem pedido tem posição real, comparação real e disputa real.
  // Confundi-lo com "aguardando base" o tiraria da competição — o oposto do
  // que o produto precisa fazer.
  const equipe = teamFromLines(['Ana Ferreira', 'Bruno Machado', 'Carla Tavares', 'Diego Peixoto'].join('\n'));
  const base = mergeTeam(
    buildDayState({
      status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
      records: [
        { sellerId: 'a', sellerName: 'Ana Ferreira', date: DATE, time: '14:00', orders: 6, revenue: 60000 },
        { sellerId: 'b', sellerName: 'Bruno Machado', date: DATE, time: '14:00', orders: 4, revenue: 41000 },
        { sellerId: 'c', sellerName: 'Carla Tavares', date: DATE, time: '14:00', orders: 2, revenue: 12000 },
      ],
    }),
    indexTeam(equipe), resolveSeller,
  );

  const v = access.buildSellerView({
    today: base, yesterday: null, sellerId: 'diego-peixoto', sellerName: 'Diego Peixoto', atMinutes: AT, config,
  });

  assertEqual(v.awaitingData, false, 'zerado marcado como sem base:');
  assertEqual(v.semProducao, true);
  assertEqual(v.performance.revenue, 0);
  assertEqual(v.gaps.position, 4, 'zerado deveria ocupar a última posição:');
  assertEqual(v.gaps.total, 4);
  assertEqual(v.gaps.toNext.revenue, 12000, 'zerado deveria ver a distância para subir:');
  assert(v.messages.some((m) => m.id === 'sem-producao'), 'faltou a cobrança de abrir o placar');
  assert(!v.messages.some((m) => m.id === 'aguardando-base'), 'mensagem de espera indevida');
});

await check('em Modo de Espera não há frase motivacional afirmando desempenho', () => {
  const empty = emptyDayState(DATE);
  const v = access.buildSellerView({
    today: empty, yesterday: null, sellerId: 'joao pedro', sellerName: 'Joao Pedro', atMinutes: AT, config,
  });
  assertEqual(v.awaitingData, true);
  assertEqual(v.messages.length, 1);
  assertEqual(v.messages[0].id, 'aguardando-base');
  assertEqual(v.team.reason, 'aguardando-base');
});
await check('sequência de alta performance exige alta performance também hoje', () => {
  const semHoje = gamification.evaluateAchievements({
    sellerDay: { timeline: [], firstOrderMinutes: null, lastMinutes: null },
    performance: { orders: 0, revenue: 0, pace: { revenueStatus: { status: 'parado', ratio: 0 } }, vsYesterdaySameTime: { revenue: { abs: 0 } } },
    positions: { opening: 5, current: 5 },
    history: { highPerformanceStreak: 9 },
    config: config.achievements,
    goals: config.goals,
  });
  assert(!semHoje.find((a) => a.id === 'sequencia-alta-performance').unlocked,
    'premiou sequência com o placar zerado');

  const comHoje = gamification.evaluateAchievements({
    sellerDay: { timeline: [], firstOrderMinutes: 540, lastMinutes: 840 },
    performance: { orders: 20, revenue: 250000, pace: { revenueStatus: { status: 'acima', ratio: 3 } }, vsYesterdaySameTime: { revenue: { abs: 0 } } },
    positions: { opening: 5, current: 5 },
    history: { highPerformanceStreak: 3 },
    config: config.achievements,
    goals: config.goals,
  });
  assert(comHoje.find((a) => a.id === 'sequencia-alta-performance').unlocked);
});

// ------------------------------------------------------------------- gestor
console.log('\nPAINEL DO GESTOR');
const managerView = access.buildManagerView({ today, yesterday, atMinutes: AT, config });
await check('gestor vê o ranking nominal completo', () => {
  assertEqual(managerView.rows.length, 5);
  assertEqual(managerView.rows[0].sellerName, 'Mariana Costa');
  assert(managerView.rows[0].performance.projection.revenue > 0);
});
await check('gestor vê a evolução de posição no dia', () => {
  const rafael = managerView.rows.find((r) => r.sellerId === 'rafael nogueira');
  assert(Number.isFinite(rafael.positionDelta));
});
await check('agregado da equipe soma todos', () => {
  assertEqual(managerView.team.revenue, 271500);
  assertEqual(managerView.team.sellerCount, 5);
});

// ----------------------------------------------- LEITURA DE TEXTO COLADO
console.log('\nLEITURA DE TEXTO COLADO');
const { parsePastedProduction } = await import('../src/data/parsePasted.js');
const EQUIPE_COLA = teamFromLines([
  'ERICA OLIVEIRA;TO',
  'MURILO BEDANI ROGERIO;TO',
  'RAFAEL VANDERLEI LOPES;RO',
].join('\n'));
const IDX_COLA = indexTeam(EQUIPE_COLA);

await check('"R$ 370.332" é trezentos e setenta mil, não trezentos e setenta reais', () => {
  assertEqual(normalizeMoney('R$ 370.332'), 370332);
  assertEqual(normalizeMoney('R$ 98.000'), 98000);
  assertEqual(normalizeMoney('1.234.567'), 1234567);
  assertEqual(normalizeMoney('R$ 126.500,00'), 126500);
  assertEqual(normalizeMoney('126500,00'), 126500);
  assertEqual(normalizeMoney('0,3'), 0.3);
});

await check('forma abreviada da tela é entendida', () => {
  assertEqual(normalizeMoney('R$ 370 mil'), 370000);
  assertEqual(normalizeMoney('R$ 1,2 mi'), 1200000);
});

await check('lê a lista no formato da tela, em uma linha', () => {
  const r = parsePastedProduction('› Erica Oliveira    R$ 370 mil    22', IDX_COLA);
  assertEqual(r.registros.length, 1);
  assertEqual(r.registros[0].sellerName, 'Erica Oliveira');
  assertEqual(r.registros[0].revenue, 370000);
  assertEqual(r.registros[0].orders, 22);
  assertEqual(r.registros[0].confianca, 'alta');
});

await check('lê a lista quando cada valor cai em uma linha', () => {
  const r = parsePastedProduction(
    'Erica Oliveira\nR$ 370 mil\n22\nMurilo Bedani Rogerio\nR$ 128.400\n9', IDX_COLA,
  );
  assertEqual(r.registros.length, 2);
  assertEqual(r.registros[1].revenue, 128400);
  assertEqual(r.registros[1].orders, 9);
});

await check('caixa alta e acento casam com o cadastro', () => {
  const r = parsePastedProduction('RAFAEL VANDERLEI LOPES  R$ 88.900  6', IDX_COLA);
  assertEqual(r.registros[0].sellerId, 'rafael-vanderlei-lopes');
  assertEqual(r.registros[0].matched, true);
});

await check('nome fora do cadastro fica de fora do ranking, mas é mostrado', () => {
  const r = parsePastedProduction('Eduardo Luiz dos Santos  R$ 12.000  1', IDX_COLA);
  assertEqual(r.registros.length, 0, 'quem não está no cadastro não pode entrar no ranking:');
  assertEqual(r.foraDoCadastro.length, 1);
  assertEqual(r.naoCadastrados[0].revenue, 12000);
  assertEqual(r.naoCadastrados[0].sellerName, 'Eduardo Luiz dos Santos');
});

await check('cabeçalho da tela não vira vendedor fantasma', () => {
  const tela = [
    'Pedidos do dia',
    'CRIADOS HOJE',
    '22 de 165',
    'R$ 370.332',
    'MINHA EQUIPE',
    'Pedidos criados hoje na sua carteira.',
    '› Erica Oliveira    R$ 370 mil    22',
  ].join('\n');
  const r = parsePastedProduction(tela, IDX_COLA);
  assertEqual(r.registros.length, 1);
  assertEqual(r.registros[0].sellerName, 'Erica Oliveira');
  assertEqual(r.foraDoCadastro.length, 0, 'cabeçalho tratado como pessoa:');
});

await check('leitura sem R$ é marcada como duvidosa', () => {
  const r = parsePastedProduction('Erica Oliveira  370332  22', IDX_COLA);
  assertEqual(r.registros[0].revenue, 370332);
  assertEqual(r.registros[0].orders, 22);
  assertEqual(r.registros[0].confianca, 'baixa');
});

await check('mesma pessoa duas vezes fica com a maior leitura', () => {
  const r = parsePastedProduction(
    'Erica Oliveira R$ 100.000 5\nErica Oliveira R$ 370.332 22', IDX_COLA,
  );
  assertEqual(r.registros.length, 1);
  assertEqual(r.registros[0].revenue, 370332);
  assert(r.avisos.length > 0);
});

await check('texto sem nenhum vendedor não inventa registro', () => {
  const r = parsePastedProduction('Pedidos do dia\n22 de 165\nR$ 370.332', IDX_COLA);
  assertEqual(r.registros.length, 0);
});

await check('sem dia anterior medido, a variação é "sem base" e não crescimento', () => {
  const equipeB = teamFromLines(['Erica Oliveira', 'Murilo Bedani Rogerio', 'Rafael Vanderlei Lopes'].join('\n'));
  const soHoje = mergeTeam(
    buildDayState({
      status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
      records: [{ sellerId: 'e', sellerName: 'Erica Oliveira', date: DATE, time: '15:30', orders: 22, revenue: 370332 }],
    }),
    indexTeam(equipeB), resolveSeller,
  );

  const gestor = access.buildManagerView({ today: soHoje, yesterday: null, atMinutes: toMinutes('15:30'), config });
  const erica = gestor.rows.find((r) => r.sellerId === 'erica-oliveira');
  assertEqual(erica.performance.vsYesterdaySameTime.revenue.semBase, true,
    'primeiro dia de uso mostraria crescimento inventado:');

  const vendedor = access.buildSellerView({
    today: soHoje, yesterday: null, sellerId: 'erica-oliveira', sellerName: 'Erica Oliveira',
    atMinutes: toMinutes('15:30'), config,
  });
  assertEqual(vendedor.performance.vsYesterdaySameTime.revenue.semBase, true);
  assert(!vendedor.messages.some((m) => m.id === 'acima-de-ontem'),
    'mensagem comparando com ontem sem ontem existir');
});

await check('com dia anterior medido, a variação volta a ser real', () => {
  const equipeB = teamFromLines(['Erica Oliveira', 'Murilo Bedani Rogerio'].join('\n'));
  const ontem = mergeTeam(buildDayState({
    status: 'ready', semantics: 'cumulative', date: YESTERDAY, meta: {},
    records: [{ sellerId: 'e', sellerName: 'Erica Oliveira', date: YESTERDAY, time: '15:00', orders: 18, revenue: 300000 }],
  }), indexTeam(equipeB), resolveSeller);
  const hoje = mergeTeam(buildDayState({
    status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
    records: [{ sellerId: 'e', sellerName: 'Erica Oliveira', date: DATE, time: '15:30', orders: 22, revenue: 370332 }],
  }), indexTeam(equipeB), resolveSeller);

  const v = access.buildSellerView({
    today: hoje, yesterday: ontem, sellerId: 'erica-oliveira', sellerName: 'Erica Oliveira',
    atMinutes: toMinutes('15:30'), config,
  });
  assertEqual(v.performance.vsYesterdaySameTime.revenue.semBase, false);
  assertEqual(v.performance.vsYesterdaySameTime.revenue.abs, 70332);
});

// --------------------------------------------------- MOVIMENTO NO RANKING
console.log('\nMOVIMENTO NO RANKING');
await check('uma única medição não gera movimento de posição', () => {
  // Com um lançamento só, comparar contra um instante em que todos estavam
  // zerados diria "subiu 15 posições" para quem apenas vem antes no alfabeto.
  const equipeM = teamFromLines(['Ana Ferreira', 'Bruno Machado', 'Carla Tavares', 'Zilda Rocha'].join('\n'));
  const umaMedicao = mergeTeam(
    buildDayState({
      status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
      records: [{ sellerId: 'z', sellerName: 'Zilda Rocha', date: DATE, time: '15:30', orders: 9, revenue: 90000 }],
    }),
    indexTeam(equipeM), resolveSeller,
  );

  const gestor = access.buildManagerView({ today: umaMedicao, yesterday: null, atMinutes: toMinutes('15:30'), config });
  assertEqual(gestor.rows[0].sellerName, 'Zilda Rocha');
  for (const row of gestor.rows) {
    assertEqual(row.positionDelta, 0, `${row.sellerName} apareceu com movimento inventado:`);
  }

  const vendedor = access.buildSellerView({
    today: umaMedicao, yesterday: null, sellerId: 'zilda-rocha', sellerName: 'Zilda Rocha',
    atMinutes: toMinutes('15:30'), config,
  });
  assertEqual(vendedor.positions.opening, vendedor.positions.current);
  assert(!vendedor.messages.some((m) => m.id === 'subiu' || m.id === 'caiu'),
    'mensagem de movimento com uma medição só');
});

await check('duas medições revelam o movimento real', () => {
  const equipeM = teamFromLines(['Ana Ferreira', 'Zilda Rocha'].join('\n'));
  const duas = mergeTeam(
    buildDayState({
      status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
      records: [
        { sellerId: 'a', sellerName: 'Ana Ferreira', date: DATE, time: '10:00', orders: 5, revenue: 50000 },
        { sellerId: 'z', sellerName: 'Zilda Rocha', date: DATE, time: '10:00', orders: 1, revenue: 9000 },
        { sellerId: 'a', sellerName: 'Ana Ferreira', date: DATE, time: '15:30', orders: 6, revenue: 60000 },
        { sellerId: 'z', sellerName: 'Zilda Rocha', date: DATE, time: '15:30', orders: 9, revenue: 90000 },
      ],
    }),
    indexTeam(equipeM), resolveSeller,
  );
  const gestor = access.buildManagerView({ today: duas, yesterday: null, atMinutes: toMinutes('15:30'), config });
  const zilda = gestor.rows.find((r) => r.sellerId === 'zilda-rocha');
  assertEqual(zilda.position, 1);
  assertEqual(zilda.positionDelta, 1, 'Zilda saiu de 2º para 1º:');
});

// ------------------------------------------- ESCOPO CALCULADO NA ORIGEM 🔒
console.log('\nESCOPO CALCULADO NA ORIGEM');
await check('painel completo do vendedor sem NENHUM dado de colega no navegador', () => {
  // Simula o adaptador com servidor: chega só a própria produção, mais a
  // posição e as distâncias já calculadas. É o desenho em que a privacidade
  // é garantida no transporte, e não apenas na exibição.
  const soMeu = buildDayState({
    status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
    records: [
      { sellerId: 'joao pedro', sellerName: 'Joao Pedro', date: DATE, time: '11:00', orders: 7, revenue: 61000 },
      { sellerId: 'joao pedro', sellerName: 'Joao Pedro', date: DATE, time: '14:00', orders: 12, revenue: 98000 },
    ],
  });
  assertEqual(soMeu.sellers.length, 1, 'o navegador recebeu mais de um vendedor:');

  const v = access.buildSellerView({
    today: soMeu,
    yesterday: null,
    sellerId: 'joao pedro',
    sellerName: 'Joao Pedro',
    atMinutes: AT,
    config,
    competitive: {
      position: 2, total: 22, isLeader: false, isLast: false,
      toNext: { revenue: 8500, orders: 0 },
      toPrevious: { revenue: 4000, orders: 1 },
      toLeader: { revenue: 8500, orders: 0 },
    },
    teamFromSource: { sellerCount: 22, activeCount: 18, orders: 150, revenue: 1352300 },
  });

  // Tudo o que a tela precisa continua lá.
  assertEqual(v.gaps.position, 2);
  assertEqual(v.gaps.total, 22);
  assertEqual(v.gaps.toNext.revenue, 8500);
  assertEqual(v.performance.revenue, 98000);
  assertEqual(v.team.visible, true);
  assertEqual(v.team.revenue, 1352300);
  assert(v.messages.length > 0);
  assertEqual(v.awaitingData, false);
  assertEqual(v.semProducao, false);
});
await check('contexto vindo da origem carrega só magnitude, nunca identidade', () => {
  const soMeu = buildDayState({
    status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
    records: [{ sellerId: 'ana', sellerName: 'Ana', date: DATE, time: '14:00', orders: 3, revenue: 30000 }],
  });
  const v = access.buildSellerView({
    today: soMeu, yesterday: null, sellerId: 'ana', sellerName: 'Ana', atMinutes: AT, config,
    competitive: { position: 5, total: 22, isLeader: false, isLast: false, toNext: { revenue: 900, orders: 1 }, toPrevious: null, toLeader: null },
  });
  const chaves = Object.keys(v.gaps.toNext);
  assertEqual(chaves.sort().join(','), 'orders,revenue', 'a distância trouxe campo além da magnitude:');
});

// ------------------------------------------------------------ ENTRADA
console.log('\nENTRADA PELO LINK');
const identidade = await import('../src/core/identity.js');

const ROSTER_TESTE = {
  manager: { name: 'Gestor', tokenHash: await identidade.sha256Hex('GEST-AAAA-BBBB') },
  sellers: [{ sellerId: 'ana', name: 'Ana', tokenHash: await identidade.sha256Hex('ANAA-1111-2222') }],
};

await check('código guardado que deixou de valer não tranca a porta', async () => {
  // O caso real: a pessoa abriu uma versão anterior, o navegador guardou aquele
  // código, e a versão nova nao o reconhece mais. Sem o encadeamento, ela via
  // "código não reconhecido" mesmo com um link válido em mãos.
  const r = await identidade.resolveFirstIdentity(
    [null, 'CODIGO-VELHO-QUE-SUMIU', 'GEST-AAAA-BBBB'], ROSTER_TESTE,
  );
  assert(r, 'ficou trancado do lado de fora');
  assertEqual(r.identity.role, 'manager');
  assertEqual(r.token, 'GEST-AAAA-BBBB');
});

await check('o código do link tem precedência sobre o guardado', async () => {
  const r = await identidade.resolveFirstIdentity(['ANAA-1111-2222', 'GEST-AAAA-BBBB'], ROSTER_TESTE);
  assertEqual(r.identity.role, 'seller');
  assertEqual(r.identity.sellerId, 'ana');
});

await check('nenhum código válido continua sendo recusa', async () => {
  const r = await identidade.resolveFirstIdentity(['XXX', 'YYY'], ROSTER_TESTE);
  assertEqual(r, null);
});

// ------------------------------------- ORIGEM SEM FATURAMENTO POR VENDEDOR
console.log('\nORIGEM SEM FATURAMENTO POR VENDEDOR');

// O sistema de pedidos da empresa da pedidos por vendedor e faturamento apenas
// por carteira. Zero ali nao e "nao vendeu": e "nao informado".
const SO_PEDIDOS = mergeTeam(
  buildDayState({
    status: 'ready', semantics: 'cumulative', date: DATE,
    meta: { faturamentoPorVendedor: false },
    records: [
      { sellerId: 'ana-ferreira', sellerName: 'ANA FERREIRA', date: DATE, time: '14:00', orders: 6, revenue: 0 },
      { sellerId: 'bruno-machado', sellerName: 'BRUNO MACHADO', date: DATE, time: '14:00', orders: 9, revenue: 0 },
      { sellerId: 'carla-tavares', sellerName: 'CARLA TAVARES', date: DATE, time: '14:00', orders: 2, revenue: 0 },
    ],
  }),
  indexTeam(teamFromLines(['Ana Ferreira', 'Bruno Machado', 'Carla Tavares', 'Diego Peixoto'].join('\n'))),
  resolveSeller,
);

await check('a origem que não informa faturamento é reconhecida', () => {
  assertEqual(SO_PEDIDOS.revenueAvailable, false);
});

await check('sem faturamento, o ranking passa a ser por pedidos', () => {
  const regras = access.regrasDeRanking(SO_PEDIDOS, config);
  assertEqual(regras.primary, 'orders');
  const r = ranking.rankAt(SO_PEDIDOS, AT, regras);
  assertEqual(r[0].sellerName, 'Bruno Machado', 'quem mais pediu deveria liderar:');
  assertEqual(r[1].sellerName, 'Ana Ferreira');
  assertEqual(r.at(-1).sellerName, 'Diego Peixoto', 'o zerado continua por último:');
});

await check('o painel do vendedor sabe que o faturamento não veio', () => {
  const v = access.buildSellerView({
    today: SO_PEDIDOS, yesterday: null, sellerId: 'ana-ferreira', sellerName: 'Ana Ferreira',
    atMinutes: AT, config,
  });
  assertEqual(v.revenueAvailable, false);
  assertEqual(v.gaps.position, 2);
  assertEqual(v.gaps.toNext.orders, 3, 'a distância precisa existir em pedidos:');
  assertEqual(v.performance.orders, 6);
});

await check('faturamento zerado de verdade não é confundido com ausente', () => {
  // Aqui a origem informa faturamento; todo mundo simplesmente ainda não vendeu.
  const zerado = buildDayState({
    status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
    records: [{ sellerId: 'a', sellerName: 'Ana', date: DATE, time: '08:30', orders: 0, revenue: 0 }],
  });
  assertEqual(zerado.revenueAvailable, true, 'dia sem produção não significa origem incompleta:');
});

// --------------------------------------------------- PLANILHA DO GOOGLE
console.log('\nPLANILHA DO GOOGLE');
const { SheetSource, parseCsv } = await import('../src/data/sources/SheetSource.js');

await check('converte qualquer link de planilha para o endereço de dados', () => {
  assertEqual(
    SheetSource.normalizarUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vABC/pubhtml'),
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vABC/pub?output=csv',
  );
  assertEqual(
    SheetSource.normalizarUrl('https://docs.google.com/spreadsheets/d/1AbC/edit#gid=7'),
    'https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=7',
  );
});

await check('lê CSV com aspas, vírgula no valor e ponto e vírgula', () => {
  const virgula = parseCsv('a,b\n"x, y",2');
  assertEqual(virgula[1][0], 'x, y');
  assertEqual(virgula[1][1], '2');
  const pv = parseCsv('a;b\n1;2');
  assertEqual(pv[1][1], '2');
});

await check('monta a curva do dia a partir da planilha', () => {
  const src = new SheetSource({ url: 'x' });
  const csv = [
    'Nome,Data,Horário,Pedidos,Faturamento',
    'ERICA OLIVEIRA,03/09/2026,10:00,12,"R$ 180.000,00"',
    'ERICA OLIVEIRA,03/09/2026,15:30,22,"R$ 370.332"',
    'MURILO BEDANI ROGERIO,03/09/2026,15:30,9,128400',
    'ERICA OLIVEIRA,02/09/2026,15:30,18,300000',
  ].join('\n');
  const payload = src.parse(csv, DATE);
  assertEqual(payload.status, 'ready');
  assertEqual(payload.records.length, 3, 'linha de outro dia entrou no dia de hoje:');
  const dia = buildDayState(payload);
  const erica = dia.sellers.find((x) => x.sellerId === 'erica-oliveira');
  assertEqual(erica.timeline.length, 2, 'a curva do dia não se formou:');
  assertEqual(erica.revenue, 370332);
});

await check('planilha sem o dia pedido não vira placar vazio silencioso', () => {
  const src = new SheetSource({ url: 'x' });
  const payload = src.parse('Nome,Data,Horário,Pedidos,Faturamento\nERICA OLIVEIRA,01/09/2026,10:00,1,100', DATE);
  assertEqual(payload.status, 'awaiting_source');
  assert(payload.message.includes('nenhum para este dia'));
});

await check('planilha sem coluna de horário ainda funciona, valendo para agora', () => {
  const src = new SheetSource({ url: 'x' });
  const payload = src.parse('Nome,Pedidos,Faturamento\nERICA OLIVEIRA,22,370332', DATE);
  assertEqual(payload.status, 'ready');
  assertEqual(payload.records[0].revenue, 370332);
  assertEqual(payload.records[0].date, DATE);
});

await check('página HTML no lugar dos dados é diagnosticada', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><body>Planilha</body></html>', { status: 200 });
  const src = new SheetSource({ url: 'https://docs.google.com/spreadsheets/d/e/X/pubhtml' });
  const payload = await src.fetchDay(DATE);
  globalThis.fetch = originalFetch;
  assertEqual(payload.status, 'error');
  assert(payload.message.includes('Publicar na web'));
});

// ------------------------------------------------------- COLETOR AUTOMÁTICO
console.log('\nCOLETOR AUTOMÁTICO');
const coletor = await import('../scripts/coletar-producao.mjs');

const RESPOSTA_REAL = {
  data: '03/09/2026',
  vendedores: [
    ['EDUARDO LUIZ DOS SANTOS', 'ERICA OLIVEIRA', 22],
    ['EDUARDO LUIZ DOS SANTOS', 'MURILO BEDANI ROGERIO', 9],
  ],
};

await check('converte a data do sistema para o formato do aplicativo', () => {
  assertEqual(coletor.dataISO('03/09/2026'), '2026-09-03');
  assertEqual(coletor.dataISO('lixo'), null);
});

await check('monta os registros com id próprio e faturamento ausente', () => {
  const r = coletor.registrosDe(RESPOSTA_REAL, { data: DATE, hora: '15:30' });
  assertEqual(r.length, 2);
  assertEqual(r[0].sellerId, 'erica-oliveira');
  assertEqual(r[0].orders, 22);
  assertEqual(r[0].revenue, 0);
  assertEqual(r[0].time, '15:30');
});

await check('cada coleta vira um ponto da curva', () => {
  const dezH = coletor.registrosDe(RESPOSTA_REAL, { data: DATE, hora: '10:00' });
  const tarde = coletor.registrosDe(
    { vendedores: [['G', 'ERICA OLIVEIRA', 30], ['G', 'MURILO BEDANI ROGERIO', 12]] },
    { data: DATE, hora: '15:30' },
  );
  const junto = coletor.acumular(dezH, tarde);
  assertEqual(junto.length, 4, 'as duas leituras deveriam coexistir:');
  const daErica = junto.filter((r) => r.sellerId === 'erica-oliveira');
  assertEqual(daErica.length, 2);
  assertEqual(daErica[1].orders, 30);
});

await check('leitura repetida não engorda o arquivo', () => {
  const uma = coletor.registrosDe(RESPOSTA_REAL, { data: DATE, hora: '10:00' });
  const igual = coletor.registrosDe(RESPOSTA_REAL, { data: DATE, hora: '10:10' });
  assertEqual(coletor.acumular(uma, igual).length, 2, 'produção idêntica virou ponto novo:');
});

await check('o arquivo coletado é lido pelo aplicativo com o ranking certo', () => {
  const registros = coletor.acumular(
    coletor.registrosDe(RESPOSTA_REAL, { data: DATE, hora: '10:00' }),
    coletor.registrosDe(
      { vendedores: [['G', 'ERICA OLIVEIRA', 30], ['G', 'MURILO BEDANI ROGERIO', 12]] },
      { data: DATE, hora: '15:30' },
    ),
  );
  // exatamente o que o coletor grava em config/producao/AAAA-MM-DD.json
  const dia = buildDayState({
    status: 'ready',
    semantics: 'cumulative',
    date: DATE,
    meta: { faturamentoPorVendedor: false },
    records: registros,
  });
  assertEqual(dia.revenueAvailable, false, 'zero de faturamento virou "não vendeu":');
  const r = ranking.rankAt(dia, toMinutes('15:30'), access.regrasDeRanking(dia, config));
  assertEqual(r[0].sellerName, 'ERICA OLIVEIRA');
  assertEqual(r[0].orders, 30);
});

// ------------------------------------------------- PRODUÇÃO PUBLICADA
console.log('\nPRODUÇÃO PUBLICADA NO REPOSITÓRIO');
const { PublishedFileSource, exportarDia } = await import('../src/data/sources/PublishedFileSource.js');

await check('o arquivo do dia preserva a curva inteira', () => {
  const dia = buildDayState({
    status: 'ready', semantics: 'cumulative', date: DATE, meta: {},
    records: [
      { sellerId: 'e', sellerName: 'Erica Oliveira', date: DATE, time: '10:00', orders: 12, revenue: 180000 },
      { sellerId: 'e', sellerName: 'Erica Oliveira', date: DATE, time: '15:30', orders: 22, revenue: 370332 },
      { sellerId: 'm', sellerName: 'Murilo Bedani', date: DATE, time: '15:30', orders: 9, revenue: 128400 },
    ],
  });
  const json = JSON.parse(exportarDia(DATE, dia));
  assertEqual(json.records.length, 3, 'a curva foi achatada na exportação:');
  assertEqual(json.semantics, 'cumulative');
  // e volta a virar a mesma curva ao ser lido
  const devolta = buildDayState({ ...json, status: 'ready', meta: {} });
  const erica = devolta.sellers.find((x) => x.sellerId === 'e');
  assertEqual(erica.timeline.length, 2);
  assertEqual(erica.revenue, 370332);
});

await check('dia não publicado devolve Modo de Espera, não erro', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  const src = new PublishedFileSource();
  const payload = await src.fetchDay(DATE);
  globalThis.fetch = originalFetch;
  assertEqual(payload.status, 'awaiting_source');
  assertEqual(payload.records.length, 0);
  assertEqual(buildDayState(payload).hasData, false);
});

await check('dia publicado é lido e vira placar', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: DATE,
    publicadoEm: '2026-09-03T18:30:00.000Z',
    semantics: 'cumulative',
    records: [
      { sellerId: 'e', sellerName: 'Erica Oliveira', date: DATE, time: '15:30', orders: 22, revenue: 370332 },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const src = new PublishedFileSource();
  const payload = await src.fetchDay(DATE);
  globalThis.fetch = originalFetch;
  assertEqual(payload.status, 'ready');
  assertEqual(buildDayState(payload).sellers[0].revenue, 370332);
});

// ------------------------------------------------------------ modo de espera
console.log('\nMODO DE ESPERA DE DADOS');
await check('fonte pendente não inventa dados', async () => {
  const src = new PendingSource();
  assertEqual(src.isConnected, false);
});
await check('estado vazio não quebra o painel do vendedor', () => {
  const empty = emptyDayState(DATE);
  const v = access.buildSellerView({
    today: empty, yesterday: null, sellerId: 'joao pedro', sellerName: 'João Pedro', atMinutes: AT, config,
  });
  assertEqual(v.status, 'awaiting_source');
  assertEqual(v.hasData, false);
  assertEqual(v.performance.revenue, 0);
  assert(Array.isArray(v.messages));
});
await check('estado vazio não quebra o painel do gestor', () => {
  const empty = emptyDayState(DATE);
  const v = access.buildManagerView({ today: empty, yesterday: null, atMinutes: AT, config });
  assertEqual(v.rows.length, 0);
  assertEqual(v.hasData, false);
});
await check('demonstração é sempre marcada como fictícia', async () => {
  const src = new DemoSource({ businessHours: config.businessHours });
  const payload = await src.fetchDay(DATE, { role: 'manager', sellerId: null });
  assertEqual(payload.meta.isDemo, true);
  assertEqual(buildDayState(payload).isDemo, true);
});
await check('fonte aplica o escopo: vendedor só recebe os próprios registros', async () => {
  const src = new DemoSource({ businessHours: config.businessHours });
  const payload = await src.fetchDay(DATE, { role: 'seller', sellerId: 'joao-pedro-alves', include: 'own' });
  const ids = new Set(payload.records.map((r) => r.sellerId));
  assertEqual(ids.size, 1);
  assertEqual([...ids][0], 'joao-pedro-alves');
});

// ------------------------------------------------------- integridade do código
// Os módulos de interface não são exercitados pelos testes acima. Importar cada
// um garante ao menos que nenhum arquivo do aplicativo está sintaticamente
// quebrado — falha que, sem isto, só apareceria como tela em branco no
// navegador do vendedor.
console.log('\nINTEGRIDADE DOS MÓDULOS');
const { readdirSync, statSync } = await import('node:fs');

function listarJs(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listarJs(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

for (const arquivo of listarJs(join(here, '..', 'src'))) {
  const relativo = arquivo.slice(arquivo.indexOf('src/'));
  // eslint-disable-next-line no-await-in-loop
  await check(`importa ${relativo}`, async () => {
    await import(`file://${arquivo}`);
  });
}

// ------------------------------------------------------------------ resumo
console.log(`\n${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) process.exit(1);
