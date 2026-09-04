import { h, downloadFile } from '../dom.js';
import {
  statTile, deltaBadge, comparison, tierBadge, sectionTitle, businessClock,
  pacePanel, progressBar, avatar,
} from '../components/widgets.js';
import { waitingBlock } from '../components/waiting.js';
import { dayChart, dayChartTable, sparkline } from '../components/chart.js';
import {
  money, number, moneyDelta, numberDelta, percentDelta, ordinal, decimal,
  dateBR, dateLongBR, timeFromMinutes, horaDaLeitura, moneyRate, orderRate,
} from '../../core/format.js';
import { versaoPublicada } from '../../core/settings.js';

/**
 * PAINEL DO GESTOR
 * ================
 *
 * Visão completa da operação: ranking nominal, cada vendedor individualmente,
 * evolução no dia, comparação com o dia anterior, projeções e exportação.
 * É o único perfil que enxerga nomes ao lado de números.
 */

export function managerView({ vm, config, app, revendo = false }) {
  // Espera é só quando a base não está conectada. Equipe inteira zerada às 8h
  // é um placar legítimo — e uma informação que o gestor precisa ver.
  const awaiting = vm.status !== 'ready';
  const tab = app.state.managerTab ?? 'ranking';

  return h('div', { class: 'view view-manager' },
    header({ vm, app }),
    revendo
      ? h('div', { class: 'preview-bar' },
        h('span', {}, h('strong', { text: `Fechamento de ${dateLongBR(vm.date)}. ` }),
          'Hoje ainda não tem produção, então o painel está mostrando a última atualização. '
          + 'Assim que o primeiro pedido do dia entrar, ele passa para hoje sozinho.'),
        h('button', {
          class: 'btn btn-sm',
          onclick: () => app.voltarParaHoje(),
          text: 'Ver o painel de hoje',
        }))
      : null,
    teamKpis({ app, vm, awaiting, config }),
    h('nav', { class: 'tabs', role: 'tablist' },
      tabButton('ranking', 'Ranking', tab, app),
      tabButton('vendedor', 'Vendedor', tab, app),
      tabButton('comparar', 'Comparar', tab, app),
      tabButton('relatorio', 'Relatório', tab, app)),
    tab === 'ranking' ? rankingTab({ vm, awaiting, app }) : null,
    tab === 'vendedor' ? sellerTab({ vm, config, app, awaiting }) : null,
    tab === 'comparar' ? compareTab({ vm, app, awaiting }) : null,
    tab === 'relatorio' ? reportTab({ vm, app, awaiting, config }) : null,
    footer({ vm, app }));
}

function tabButton(id, label, current, app) {
  return h('button', {
    class: ['tab', current === id && 'tab-on'],
    role: 'tab',
    'aria-selected': current === id ? 'true' : 'false',
    onclick: () => app.setManagerTab(id),
    text: label,
  });
}

function header({ vm, app }) {
  return h('header', { class: 'app-header' },
    h('div', { class: 'app-header-main' },
      h('div', { class: 'app-title' },
        h('span', { class: 'app-name', text: 'Painel do Gestor' }),
        h('span', { class: 'badge badge-manager', text: 'ACESSO TOTAL' })),
      h('div', { class: 'app-subtitle', text: dateLongBR(vm.date) })),
    h('div', { class: 'app-header-side' },
      businessClock({
        phase: vm.phase,
        elapsedMinutes: vm.elapsedMinutes,
        remainingMinutes: vm.team.performance.remainingMinutes,
        atMinutes: vm.atMinutes,
      }),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.goAdmin(), text: '⚙ Configuração' })));
}

function teamKpis({ app, vm, awaiting, config }) {
  const p = vm.team.performance;
  const temFaturamento = vm.revenueAvailable;
  const falhou = vm.status === 'error' && Boolean(vm.sourceMessage);
  const aindaNaoAbriu = !falhou && vm.phase === 'antes';
  const ultimoFechamento = app.fechamentoAnterior;
  return h('section', { class: 'card' },
    sectionTitle('Resultado da equipe hoje',
      h('span', { class: 'section-hint', text: `${number(vm.team.activeCount)} de ${number(vm.team.sellerCount)} produzindo` })),
    awaiting
      // Sem caminho de saída, esta tela é um beco: diz que falta base e para
      // por aí. O gestor é justamente quem pode resolver, então o botão que
      // resolve fica aqui, e não escondido atrás do menu de configuração.
      //
      // E "ainda não há produção hoje" não é a mesma coisa que "não consegui
      // ler a origem". As duas davam a mesma tela, e quem olhasse não teria
      // como saber se era cedo demais ou se algo estava quebrado.
      ? waitingBlock({
        title: falhou
          ? 'Não consegui ler a base de dados'
          : (aindaNaoAbriu ? 'O expediente de hoje ainda não começou' : undefined),
        detail: falhou
          ? `${vm.sourceMessage} Enquanto isso, dá para lançar a produção à mão — o painel funciona igual.`
          : aindaNaoAbriu
            // Placar vazio de madrugada não é defeito, é a hora. Sem dizer
            // isso, a tela é indistinguível de uma que quebrou.
            ? `O dia começa às ${config.businessHours?.start ?? '08:00'} e o placar enche a partir daí. `
              + 'Nada produzido até agora é o esperado a esta hora.'
            : vm.origemConectada
              ? 'A base está conectada e ainda não trouxe nenhum pedido de hoje. '
                + 'A leitura acontece de dez em dez minutos; o placar abre no primeiro pedido da equipe.'
              : 'Nenhuma produção foi lançada hoje. Abra o sistema de pedidos, selecione a lista da sua equipe, '
                + 'copie e cole aqui: o painel inteiro — ranking, ritmo, projeção e comparação com ontem — se monta a partir disso.',
        fields: falhou || aindaNaoAbriu ? [] : undefined,
        action: h('div', { class: 'button-row' },
          ultimoFechamento
            ? h('button', {
              class: 'btn btn-primary',
              onclick: () => app.verFechamentoAnterior(),
              text: `Ver o fechamento de ${dateBR(ultimoFechamento.date)}`,
            })
            : null,
          h('button', {
            class: ultimoFechamento ? 'btn' : 'btn btn-primary',
            onclick: () => { app.setAdminTab('lancar'); app.goAdmin(); },
            text: 'Lançar a produção de hoje',
          })),
      })
      : h('div', {},
        h('div', { class: 'kpi-grid' },
          statTile({
            label: 'Pedidos da equipe', icon: '📦', hero: true,
            value: number(vm.team.orders),
            sub: comparison(p.vsYesterdaySameTime.orders, 'orders'),
          }),
          temFaturamento
            ? statTile({
              label: 'Faturamento da equipe', icon: '💰', hero: true,
              value: money(vm.team.revenue),
              sub: comparison(p.vsYesterdaySameTime.revenue, 'revenue'),
            })
            // Sem faturamento por vendedor, o total da carteira ainda é um
            // número real — e é o resultado do dia da equipe. Deixar a linha
            // vazia com ele à mão era jogar fora o que a origem informa.
            : statTile({
              label: 'Faturamento da equipe', icon: '💰', hero: true,
              value: vm.team.revenueInformadaPelaOrigem ? money(vm.team.revenue) : '—',
              sub: vm.team.revenueInformadaPelaOrigem
                ? 'total da carteira — a origem não reparte por vendedor'
                : 'a origem informa faturamento por carteira, não por vendedor',
            }),
          // Sem faturamento por vendedor, todo indicador de dinheiro vira R$ 0
          // e mente. Nesses dias quem ocupa o lugar de destaque é o pedido —
          // que é o que a origem realmente informa e o que decide o ranking.
          statTile({
            label: 'Projeção de fechamento', icon: '📈',
            value: temFaturamento
              ? (p.projection.revenue === null ? '—' : money(p.projection.revenue))
              : (p.projection.orders === null ? '—' : `${number(p.projection.orders)} pedidos`),
            sub: h('span', {
              class: 'muted',
              text: temFaturamento
                ? (p.projection.orders === null ? '' : `${number(p.projection.orders)} pedidos projetados`)
                : 'no ritmo de agora até o fim do expediente',
            }),
          }),
          statTile({
            label: 'Ritmo da equipe', icon: '⚡',
            value: temFaturamento ? moneyRate(p.pace.revenue) : orderRate(p.pace.orders),
            sub: h('span', {
              class: 'muted',
              text: temFaturamento ? `${decimal(p.pace.orders)} pedidos/hora` : 'por hora de expediente',
            }),
          })),
        h('div', { class: 'kpi-sub-grid' },
          temFaturamento
            ? statTile({ label: 'Média por vendedor', value: money(vm.team.avgRevenue), icon: '👤' })
            : statTile({ label: 'Média por vendedor', value: decimal(vm.team.avgOrders), icon: '👤', sub: h('span', { class: 'muted', text: 'pedidos por vendedor' }) }),
          statTile({ label: 'Média de pedidos', value: decimal(vm.team.avgOrders), icon: '📊' }),
          temFaturamento
            ? statTile({
              label: 'Meta da equipe',
              value: p.goals.revenueProgress === null ? '—' : `${Math.round(p.goals.revenueProgress * 100)}%`,
              icon: '🎯',
              sub: h('span', { class: 'muted', text: `alvo ${money((config.goals?.dailyRevenue ?? 0) * vm.team.sellerCount)}` }),
            })
            : statTile({
              label: 'Meta da equipe',
              value: p.goals.ordersProgress === null || p.goals.ordersProgress === undefined
                ? '—'
                : `${Math.round(p.goals.ordersProgress * 100)}%`,
              icon: '🎯',
              sub: h('span', { class: 'muted', text: `alvo ${number((config.goals?.dailyOrders ?? 0) * vm.team.sellerCount)} pedidos` }),
            }))));
}

// ------------------------------------------------------------------ ranking
function rankingTab({ vm, awaiting, app }) {
  if (awaiting) {
    return h('section', { class: 'card' }, sectionTitle('Ranking da equipe'),
      waitingBlock({ compact: true, title: 'Ranking em espera',
        detail: 'As posições aparecem assim que houver produção lançada no dia.' }));
  }
  const zerados = vm.rows.filter((r) => r.semProducaoNaBase || r.semProducao).length;

  return h('section', { class: 'card' },
    sectionTitle('Ranking da equipe', h('span', {
      class: 'section-hint',
      text: vm.revenueAvailable ? 'critério: faturamento do dia' : 'critério: pedidos do dia',
    })),
    vm.revenueAvailable
      ? null
      : h('div', { class: 'alert alert-info' },
        h('strong', { text: 'Ranking por pedidos. ' }),
        'A origem dos dados informa faturamento por carteira, não por vendedor. '
        + 'Repartir o valor da carteira entre a equipe daria um número plausível e falso, '
        + 'então a coluna de faturamento fica vazia e a disputa corre por pedidos.'),
    vm.foraDoCadastro?.length
      ? h('div', { class: 'alert alert-warn' },
        h('strong', { text: 'Fora do cadastro: ' }),
        `a base trouxe ${vm.foraDoCadastro.length === 1 ? 'um nome' : `${vm.foraDoCadastro.length} nomes`} que não está na sua equipe (${vm.foraDoCadastro.join(', ')}). `,
        'Ninguém foi descartado — eles aparecem assinalados na tabela. Ajuste o cadastro na aba Equipe.')
      : null,
    zerados
      ? h('p', { class: 'muted', text: `${number(zerados)} ${zerados === 1 ? 'vendedor está' : 'vendedores estão'} sem produção até agora e ${zerados === 1 ? 'aparece' : 'aparecem'} nas últimas posições — o cadastro da equipe garante que ninguém suma do ranking.` })
      : null,
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table ranking-table' },
        h('thead', {}, h('tr', {},
          h('th', { text: '#' }),
          h('th', { text: 'Vendedor' }),
          h('th', { class: 'num', text: 'Pedidos' }),
          h('th', { class: 'num', text: 'Faturamento' }),
          h('th', { class: 'num', text: 'vs ontem (mesmo horário)' }),
          h('th', { class: 'num', text: '%' }),
          h('th', { class: 'num', text: 'Ritmo' }),
          h('th', { class: 'num', text: 'Projeção' }),
          h('th', { class: 'num', text: 'Para a próxima' }),
          h('th', { text: 'Nível' }),
          h('th', { text: 'Curva' }))),
        h('tbody', {}, vm.rows.map((row) => rankingRow(row, app, vm.revenueAvailable))))),
    h('p', { class: 'privacy-note' },
      h('span', { 'aria-hidden': 'true', text: '🔒' }),
      'Esta tabela existe somente no seu perfil. O aplicativo do vendedor não tem tela, rota nem dado capaz de montá-la.'));
}

function rankingRow(row, app, temFaturamento = true) {
  const p = row.performance;
  // Quando a origem informa faturamento só por carteira, `revenue` chega zero
  // para todo mundo. Imprimir "R$ 0" seria afirmar que ninguém vendeu — a
  // mesma confusão entre "zerado" e "não informado" que este aplicativo existe
  // para não cometer. Sem o dado, as colunas de dinheiro passam a mostrar o que
  // de fato está sendo disputado: pedidos.
  const r = temFaturamento ? p.vsYesterdaySameTime.revenue : p.vsYesterdaySameTime.orders;
  const semDado = () => h('span', {
    class: 'muted', title: 'A origem dos dados não informa faturamento por vendedor', text: 'não informado',
  });
  return h('tr', {
    class: [row.position === 1 && 'row-leader', row.semProducao && 'row-idle', row.foraDoCadastro && 'row-outsider'],
    onclick: () => app.openSeller(row.sellerId),
    title: 'Abrir o painel individual',
  },
  h('td', {}, h('span', { class: 'pos-cell' },
    h('span', { class: 'pos-number', text: ordinal(row.position) }),
    row.positionDelta !== 0
      ? h('span', {
        class: ['pos-move', row.positionDelta > 0 ? 'delta-up' : 'delta-down'],
        title: `${Math.abs(row.positionDelta)} ${Math.abs(row.positionDelta) === 1 ? 'posição' : 'posições'} ${row.positionDelta > 0 ? 'ganhas' : 'perdidas'} hoje`,
      }, `${row.positionDelta > 0 ? '▲' : '▼'}${Math.abs(row.positionDelta)}`)
      : null)),
  h('td', {}, h('span', { class: 'name-cell' },
    avatar(row.sellerName),
    h('span', { text: row.sellerName }),
    row.uf ? h('span', { class: 'uf-tag', text: row.uf }) : null,
    row.foraDoCadastro ? h('span', { class: 'flag-outsider', title: 'Veio na base mas não está no cadastro da equipe', text: 'FORA DO CADASTRO' }) : null)),
  h('td', { class: 'num strong', text: number(p.orders) }),
  h('td', { class: 'num strong' }, temFaturamento ? money(p.revenue) : semDado()),
  h('td', { class: 'num' }, r.semBase
    ? h('span', { class: 'muted', title: 'Não há registro do dia anterior para comparar', text: 'sem base' })
    : deltaBadge(r.direction, temFaturamento ? moneyDelta(r.abs) : numberDelta(r.abs), { size: 'sm' })),
  h('td', { class: 'num', text: r.semBase || r.pct === null ? '—' : percentDelta(r.pct) }),
  h('td', { class: 'num', text: temFaturamento ? moneyRate(p.pace.revenue) : orderRate(p.pace.orders) }),
  h('td', { class: 'num' }, temFaturamento
    ? (p.projection.revenue === null ? '—' : money(p.projection.revenue))
    : (p.projection.orders === null ? '—' : number(p.projection.orders))),
  h('td', { class: 'num' }, row.gaps?.toNext
    ? (temFaturamento ? money(row.gaps.toNext.revenue) : number(row.gaps.toNext.orders))
    : '—'),
  h('td', {}, tierBadge(row.tier, { size: 'sm' })),
  h('td', {}, sparkline(row.timeline, temFaturamento ? 'revenue' : 'orders')));
}

// --------------------------------------------------------- vendedor (drill)
function sellerTab({ vm, config, app, awaiting }) {
  if (awaiting) {
    return h('section', { class: 'card' }, sectionTitle('Vendedor'), waitingBlock({}));
  }
  const selectedId = app.state.selectedSeller ?? vm.rows[0]?.sellerId;
  const row = vm.rows.find((r) => r.sellerId === selectedId) ?? vm.rows[0];
  if (!row) return h('section', { class: 'card' }, h('p', { class: 'muted', text: 'Nenhum vendedor na base do dia.' }));

  const p = row.performance;
  const metric = app.state.metric;

  return h('section', { class: 'card' },
    sectionTitle('Painel individual',
      h('div', { class: 'title-actions' },
        h('button', {
          class: 'btn btn-sm',
          onclick: () => app.previewSeller(row.sellerId),
          title: 'Ver a tela deste vendedor exatamente como ele vê',
          text: '👁 Ver como o vendedor vê',
        }),
      h('select', {
        class: 'select',
        'aria-label': 'Escolher vendedor',
        onchange: (e) => app.openSeller(e.target.value),
      }, vm.rows.map((r) => h('option', { value: r.sellerId, selected: r.sellerId === row.sellerId }, `${ordinal(r.position)} — ${r.sellerName}`))))),

    h('div', { class: 'drill-head' },
      avatar(row.sellerName),
      h('div', {},
        h('div', { class: 'drill-name', text: row.sellerName }),
        h('div', { class: 'drill-sub' },
          h('span', { text: `${ordinal(row.position)} lugar` }),
          tierBadge(row.tier),
          row.positionDelta !== 0
            ? deltaBadge(row.positionDelta > 0 ? 'up' : 'down', `${Math.abs(row.positionDelta)} no dia`, { size: 'sm' })
            : null))),

    h('div', { class: 'kpi-grid' },
      statTile({ label: 'Pedidos hoje', icon: '📦', hero: true, value: number(p.orders), sub: comparison(p.vsYesterdaySameTime.orders, 'orders') }),
      statTile({ label: 'Faturamento hoje', icon: '💰', hero: true, value: money(p.revenue), sub: comparison(p.vsYesterdaySameTime.revenue, 'revenue') }),
      statTile({ label: 'Projeção de pedidos', icon: '📈', value: p.projection.orders === null ? '—' : number(p.projection.orders) }),
      statTile({ label: 'Projeção de faturamento', icon: '📈', value: p.projection.revenue === null ? '—' : money(p.projection.revenue) })),

    h('div', { class: 'two-col' },
      h('div', {}, sectionTitle('Ritmo'), pacePanel(p)),
      h('div', {}, sectionTitle('Meta do dia'),
        progressBar({
          value: p.goals.revenueProgress ?? 0,
          label: 'Faturamento',
          caption: `${money(p.revenue)} de ${money(p.goals.revenue ?? 0)}`,
        }),
        progressBar({
          value: p.goals.ordersProgress ?? 0,
          label: 'Pedidos',
          caption: `${number(p.orders)} de ${number(p.goals.orders ?? 0)}`,
          tone: 'alt',
        }))),

    h('div', { class: 'chart-head' },
      sectionTitle('Evolução no dia'),
      h('div', { class: 'seg' },
        h('button', { class: ['seg-btn', metric === 'revenue' && 'seg-on'], onclick: () => app.setMetric('revenue'), text: 'Faturamento' }),
        h('button', { class: ['seg-btn', metric === 'orders' && 'seg-on'], onclick: () => app.setMetric('orders'), text: 'Pedidos' }),
        h('button', { class: 'seg-btn', onclick: () => app.toggleChartTable(), text: app.state.chartAsTable ? 'Gráfico' : 'Tabela' }))),
    h('div', { class: 'legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-today' }), 'Hoje'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-yesterday' }), 'Ontem')),
    app.state.chartAsTable
      ? dayChartTable({ today: row.timeline, yesterday: row.yesterdayTimeline, metric })
      : dayChart({
        today: row.timeline,
        yesterday: row.yesterdayTimeline,
        metric,
        businessHours: config.businessHours,
        nowMinutes: vm.atMinutes,
        height: 240,
      }),

    h('div', { class: 'gap-strip' },
      h('div', {}, h('span', { class: 'gap-label', text: 'Distância para a próxima posição' }),
        h('span', { class: 'gap-value', text: row.gaps?.toNext ? money(row.gaps.toNext.revenue) : '— (líder)' })),
      h('div', {}, h('span', { class: 'gap-label', text: 'Vantagem sobre a posição anterior' }),
        h('span', { class: 'gap-value', text: row.gaps?.toPrevious ? money(row.gaps.toPrevious.revenue) : '— (último)' })),
      h('div', {}, h('span', { class: 'gap-label', text: 'Distância para a liderança' }),
        h('span', { class: 'gap-value', text: row.gaps?.toLeader ? money(row.gaps.toLeader.revenue) : '— (é o líder)' }))));
}

// ----------------------------------------------------------------- comparar
function compareTab({ vm, app, awaiting }) {
  if (awaiting) return h('section', { class: 'card' }, sectionTitle('Comparar'), waitingBlock({}));

  const a = vm.rows.find((r) => r.sellerId === app.state.compareA) ?? vm.rows[0];
  const b = vm.rows.find((r) => r.sellerId === app.state.compareB) ?? vm.rows[1] ?? vm.rows[0];
  if (!a || !b) return h('section', { class: 'card' }, h('p', { class: 'muted', text: 'É preciso ao menos dois vendedores na base.' }));

  const pick = (value, onchange, label) => h('select', {
    class: 'select', 'aria-label': label, onchange: (e) => onchange(e.target.value),
  }, vm.rows.map((r) => h('option', { value: r.sellerId, selected: r.sellerId === value }, r.sellerName)));

  const line = (label, av, bv, better) => h('tr', {},
    h('td', { text: label }),
    h('td', { class: ['num', better === 'a' && 'cell-better'], text: av }),
    h('td', { class: ['num', better === 'b' && 'cell-better'], text: bv }));

  const cmp = (x, y) => (x > y ? 'a' : y > x ? 'b' : null);

  return h('section', { class: 'card' },
    sectionTitle('Comparar vendedores'),
    h('div', { class: 'compare-picks' },
      pick(a.sellerId, (v) => app.setCompare('compareA', v), 'Vendedor A'),
      h('span', { class: 'versus', text: 'x' }),
      pick(b.sellerId, (v) => app.setCompare('compareB', v), 'Vendedor B')),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {},
          h('th', { text: '' }),
          h('th', { class: 'num', text: a.sellerName }),
          h('th', { class: 'num', text: b.sellerName }))),
        h('tbody', {},
          line('Posição', ordinal(a.position), ordinal(b.position), cmp(-a.position, -b.position)),
          line('Pedidos', number(a.performance.orders), number(b.performance.orders), cmp(a.performance.orders, b.performance.orders)),
          line('Faturamento', money(a.performance.revenue), money(b.performance.revenue), cmp(a.performance.revenue, b.performance.revenue)),
          line('Ritmo (R$/h)', moneyRate(a.performance.pace.revenue), moneyRate(b.performance.pace.revenue), cmp(a.performance.pace.revenue, b.performance.pace.revenue)),
          line('Projeção', a.performance.projection.revenue === null ? '—' : money(a.performance.projection.revenue),
            b.performance.projection.revenue === null ? '—' : money(b.performance.projection.revenue),
            cmp(a.performance.projection.revenue ?? 0, b.performance.projection.revenue ?? 0)),
          line('vs ontem (mesmo horário)', moneyDelta(a.performance.vsYesterdaySameTime.revenue.abs),
            moneyDelta(b.performance.vsYesterdaySameTime.revenue.abs),
            cmp(a.performance.vsYesterdaySameTime.revenue.abs, b.performance.vsYesterdaySameTime.revenue.abs)),
          line('Nível', a.tier.current.name, b.tier.current.name, cmp(a.tier.index, b.tier.index)),
          line('Movimento no dia', `${a.positionDelta >= 0 ? '+' : ''}${a.positionDelta}`,
            `${b.positionDelta >= 0 ? '+' : ''}${b.positionDelta}`, cmp(a.positionDelta, b.positionDelta))))));
}

// ---------------------------------------------------------------- relatório
function reportTab({ vm, app, awaiting, config }) {
  const rows = vm.rows;

  const csv = () => {
    const head = [
      'posicao', 'vendedor', 'pedidos_hoje', 'faturamento_hoje',
      'pedidos_ontem_mesmo_horario', 'faturamento_ontem_mesmo_horario',
      'dif_pedidos', 'dif_faturamento', 'dif_faturamento_pct',
      'ritmo_pedidos_hora', 'ritmo_faturamento_hora',
      'projecao_pedidos', 'projecao_faturamento',
      'nivel', 'variacao_posicao', 'distancia_proxima_posicao',
    ].join(';');
    const body = rows.map((r) => {
      const p = r.performance;
      return [
        r.position, `"${r.sellerName}"`, p.orders, p.revenue,
        p.vsYesterdaySameTime.orders.baseline, p.vsYesterdaySameTime.revenue.baseline,
        p.vsYesterdaySameTime.orders.abs, p.vsYesterdaySameTime.revenue.abs,
        p.vsYesterdaySameTime.revenue.pct === null ? '' : (p.vsYesterdaySameTime.revenue.pct * 100).toFixed(1),
        p.pace.orders.toFixed(2), p.pace.revenue.toFixed(2),
        p.projection.orders ?? '', p.projection.revenue ?? '',
        r.tier.current.name, r.positionDelta, r.gaps?.toNext?.revenue ?? '',
      ].join(';');
    }).join('\n');
    return `${head}\n${body}`;
  };

  const json = () => JSON.stringify({
    data: vm.date,
    horario: timeFromMinutes(vm.atMinutes),
    geradoEm: new Date().toISOString(),
    expediente: config.businessHours,
    equipe: vm.team,
    ranking: rows.map((r) => ({
      posicao: r.position,
      vendedor: r.sellerName,
      pedidos: r.performance.orders,
      faturamento: r.performance.revenue,
      projecao: r.performance.projection,
      ritmo: r.performance.pace,
      vsOntemMesmoHorario: r.performance.vsYesterdaySameTime,
      nivel: r.tier.current.name,
      variacaoPosicao: r.positionDelta,
    })),
  }, null, 2);

  return h('section', { class: 'card' },
    sectionTitle('Relatório administrativo'),
    awaiting
      ? waitingBlock({ title: 'Nada a exportar ainda', detail: 'A exportação fica disponível quando houver produção na base.' })
      : h('div', {},
        h('p', { class: 'muted', text: `Ranking completo de ${dateLongBR(vm.date)} às ${timeFromMinutes(vm.atMinutes)}, com ${number(rows.length)} vendedores.` }),
        h('div', { class: 'button-row' },
          h('button', {
            class: 'btn btn-primary',
            onclick: () => downloadFile(`liga-comercial-${vm.date}.csv`, csv(), 'text/csv'),
            text: '⬇ Exportar CSV',
          }),
          h('button', {
            class: 'btn',
            onclick: () => downloadFile(`liga-comercial-${vm.date}.json`, json(), 'application/json'),
            text: '⬇ Exportar JSON',
          })),
        h('p', { class: 'privacy-note' },
          h('span', { 'aria-hidden': 'true', text: '🔒' }),
          'A exportação é uma permissão exclusiva do gestor.')));
}

function footer({ vm, app }) {
  return h('footer', { class: 'app-footer' },
    h('span', { class: 'muted' },
      // A hora do relógio não diz nada sobre o placar: com o coletor parado, um
      // número de horas atrás tem a mesma cara de um número de agora.
      vm.lidaEm ? `Base lida às ${horaDaLeitura(vm.lidaEm)}` : `Atualizado às ${timeFromMinutes(vm.atMinutes)}`,
      versaoPublicada() ? h('span', { class: 'versao', title: 'Versão publicada deste aplicativo', text: ` · v${versaoPublicada()}` }) : null),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.refresh(), text: '↻ Atualizar' }),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.logout(), text: 'Sair' }));
}
