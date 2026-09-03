import { h } from '../dom.js';
import {
  statTile, deltaBadge, comparison, progressBar, tierBadge, positionBadge,
  messageList, achievementGrid, pacePanel, sectionTitle, businessClock,
} from '../components/widgets.js';
import { waitingBlock, waitingValue } from '../components/waiting.js';
import { dayChart, dayChartTable } from '../components/chart.js';
import {
  money, number, moneyDelta, numberDelta, percentDelta, ordinal, dateLongBR, timeFromMinutes,
} from '../../core/format.js';

/**
 * PAINEL DO VENDEDOR
 * ==================
 *
 * Recebe exclusivamente o view model construído por `core/access.js`, que já
 * passou pelas três barreiras de privacidade. Esta tela não tem acesso ao
 * estado da equipe e, por construção, não teria como exibir o dado de um colega
 * mesmo se alguém tentasse.
 */

export function sellerView({ vm, config, app }) {
  // "Aguardando" é só quando a BASE não está conectada. Vendedor zerado com a
  // base no ar tem placar, posição e disputa reais — ele não some da liga.
  const awaiting = vm.awaitingData;

  if (app.state.compact) return compactView({ vm, app, awaiting });

  return h('div', { class: 'view view-seller' },
    header({ vm, app }),
    heroSection({ vm, awaiting }),
    vm.messages.length ? h('section', { class: 'card card-messages' }, messageList(vm.messages)) : null,
    disputeSection({ vm, awaiting }),
    comparisonSection({ vm, awaiting }),
    projectionSection({ vm, awaiting, config }),
    h('section', { class: 'card' },
      sectionTitle('Ritmo de produção'),
      awaiting
        ? waitingBlock({ compact: true, title: 'Sem ritmo para medir', detail: 'O ritmo é calculado sobre os pedidos e o faturamento do dia.' })
        : pacePanel(vm.performance)),
    chartSection({ vm, config, app, awaiting }),
    tierSection({ vm, awaiting }),
    h('section', { class: 'card' },
      sectionTitle('Conquistas do dia'),
      awaiting
        ? waitingBlock({ compact: true, title: 'Conquistas aguardando', detail: 'As conquistas do dia dependem da base de dados.' })
        : achievementGrid(vm.achievements)),
    teamSection({ vm, awaiting }),
    footer({ vm, app }));
}

// ---------------------------------------------------------------- cabeçalho
function header({ vm, app }) {
  return h('header', { class: 'app-header' },
    h('div', { class: 'app-header-main' },
      h('div', { class: 'app-title' },
        h('span', { class: 'app-name', text: vm.identity.sellerName ?? 'Vendedor' }),
        vm.awaitingData ? null : tierBadge(vm.tier)),
      h('div', { class: 'app-subtitle', text: dateLongBR(vm.date) })),
    h('div', { class: 'app-header-side' },
      businessClock({
        phase: vm.phase,
        elapsedMinutes: vm.performance.elapsedMinutes,
        remainingMinutes: vm.performance.remainingMinutes,
        atMinutes: vm.atMinutes,
      }),
      h('button', {
        class: 'btn btn-ghost btn-sm', title: 'Modo compacto (janela pequena)',
        onclick: () => app.toggleCompact(), text: '▭ Compacto',
      })));
}

// -------------------------------------------------------------------- herói
function heroSection({ vm, awaiting }) {
  const delta = vm.positions.opening != null && vm.positions.current != null
    ? vm.positions.opening - vm.positions.current
    : 0;

  return h('section', { class: 'card card-hero' },
    h('div', { class: 'hero-position' },
      positionBadge(awaiting ? null : vm.gaps?.position, vm.gaps?.total, { delta }),
      h('div', { class: 'hero-position-text' },
        awaiting
          ? h('span', { class: 'muted', text: 'Posição indisponível até a base ser conectada.' })
          : h('span', {
            class: 'hero-headline',
            text: vm.gaps?.isLeader ? 'Você está na liderança.' : `Você está em ${ordinal(vm.gaps?.position)} lugar.`,
          }),
        delta !== 0 && !awaiting
          ? h('span', { class: 'hero-move' },
            deltaBadge(delta > 0 ? 'up' : 'down',
              `${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'posição' : 'posições'} ${delta > 0 ? 'ganhas' : 'perdidas'} hoje`))
          : null)),
    h('div', { class: 'hero-stats' },
      statTile({
        label: 'Pedidos hoje',
        value: awaiting ? '—' : number(vm.performance.orders),
        hero: true,
        icon: '📦',
        sub: awaiting ? waitingValue() : comparison(vm.performance.vsYesterdaySameTime.orders, 'orders'),
      }),
      statTile({
        label: 'Faturamento hoje',
        value: awaiting ? '—' : money(vm.performance.revenue),
        hero: true,
        icon: '💰',
        sub: awaiting ? waitingValue() : comparison(vm.performance.vsYesterdaySameTime.revenue, 'revenue'),
      })));
}

// ------------------------------------------------------------------ disputa
function disputeSection({ vm, awaiting }) {
  if (awaiting) {
    return h('section', { class: 'card' },
      sectionTitle('A disputa'),
      waitingBlock({ compact: true, title: 'Sem disputa para mostrar ainda', detail: 'As distâncias para as posições vizinhas aparecem quando a base for conectada.' }));
  }
  const next = vm.gaps?.toNext;
  const prev = vm.gaps?.toPrevious;

  return h('section', { class: 'card card-dispute' },
    sectionTitle('A disputa'),
    h('div', { class: 'dispute-grid' },
      h('div', { class: 'dispute-box dispute-up' },
        h('div', { class: 'dispute-label' }, h('span', { 'aria-hidden': 'true', text: '⬆' }), 'Para avançar uma posição'),
        next
          ? h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: next.revenue > 0 ? money(next.revenue) : 'Empate' }),
            next.revenue > 0
              ? (next.orders > 0
                ? h('span', { class: 'dispute-sub', text: `ou ${number(next.orders)} ${next.orders === 1 ? 'pedido' : 'pedidos'} a mais` })
                : h('span', { class: 'dispute-sub', text: 'em pedidos você não está atrás — falta faturamento' }))
              : h('span', { class: 'dispute-sub', text: 'faturamento empatado — o próximo pedido decide' }))
          : h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: '🏆' }),
            h('span', { class: 'dispute-sub', text: 'Você está em 1º. Não há posição acima.' }))),
      h('div', { class: 'dispute-box dispute-down' },
        h('div', { class: 'dispute-label' }, h('span', { 'aria-hidden': 'true', text: '⬇' }), 'Vantagem sobre quem vem atrás'),
        prev
          ? h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: prev.revenue > 0 ? money(prev.revenue) : 'Empate' }),
            h('span', { class: 'dispute-sub', text: prev.revenue > 0
              ? (prev.orders > 0 ? `e ${number(prev.orders)} ${prev.orders === 1 ? 'pedido' : 'pedidos'} de vantagem` : 'vantagem só em faturamento')
              : 'estão colados em você — não deixe passar' }))
          : h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: '—' }),
            h('span', { class: 'dispute-sub', text: 'Você está na última posição. Só há caminho para cima.' })))),
    h('p', { class: 'privacy-note' },
      h('span', { 'aria-hidden': 'true', text: '🔒' }),
      'Você vê a distância, nunca quem está na outra posição. O mesmo vale para os demais em relação a você.'));
}

// --------------------------------------------------- comparação com ontem
function comparisonSection({ vm, awaiting }) {
  const o = vm.performance.vsYesterdaySameTime.orders;
  const r = vm.performance.vsYesterdaySameTime.revenue;
  const hasBaseline = r.baseline > 0 || o.baseline > 0;

  return h('section', { class: 'card' },
    sectionTitle(`Comparação com ontem às ${timeFromMinutes(vm.atMinutes)}`),
    awaiting
      ? waitingBlock({ compact: true, title: 'Sem comparação disponível', detail: 'A comparação com o dia anterior depende da base de dados.' })
      : !hasBaseline
        ? h('p', { class: 'muted', text: 'Ainda não há produção registrada no dia anterior neste horário para comparar.' })
        : h('div', { class: 'table-scroll' },
          h('table', { class: 'data-table compare-table' },
            h('thead', {}, h('tr', {},
              h('th', { text: '' }),
              h('th', { class: 'num', text: 'Hoje' }),
              h('th', { class: 'num', text: 'Ontem' }),
              h('th', { class: 'num', text: 'Diferença' }))),
            h('tbody', {},
              h('tr', {},
                h('td', { text: 'Pedidos' }),
                h('td', { class: 'num strong', text: number(o.current) }),
                h('td', { class: 'num', text: number(o.baseline) }),
                h('td', { class: 'num' }, h('span', { class: 'comparison comparison-end' },
                  deltaBadge(o.direction, numberDelta(o.abs), { size: 'sm' }),
                  o.pct === null ? null : h('span', { class: 'comparison-pct', text: percentDelta(o.pct) })))),
              h('tr', {},
                h('td', { text: 'Faturamento' }),
                h('td', { class: 'num strong', text: money(r.current) }),
                h('td', { class: 'num', text: money(r.baseline) }),
                h('td', { class: 'num' }, h('span', { class: 'comparison comparison-end' },
                  deltaBadge(r.direction, moneyDelta(r.abs), { size: 'sm' }),
                  r.pct === null ? null : h('span', { class: 'comparison-pct', text: percentDelta(r.pct) }))))))));
}

// ---------------------------------------------------------------- projeção
function projectionSection({ vm, awaiting, config }) {
  const p = vm.performance.projection;
  const waitingPace = p.revenueModel === 'aguardando';

  return h('section', { class: 'card' },
    sectionTitle('Projeção de fechamento', h('span', {
      class: 'section-hint',
      text: `expediente até ${config.businessHours?.end ?? '18:00'}`,
    })),
    awaiting
      ? waitingBlock({ compact: true, title: 'Sem projeção', detail: 'A projeção é calculada a partir da produção do dia.' })
      : waitingPace
        ? h('p', { class: 'muted', text: 'Ainda é cedo para projetar. A projeção começa depois dos primeiros minutos de expediente, para não extrapolar ruído.' })
        : h('div', { class: 'projection-grid' },
          statTile({
            label: 'Pedidos projetados', icon: '📦',
            value: p.orders === null ? '—' : number(p.orders),
            sub: h('span', { class: 'muted', text: `realizado: ${number(vm.performance.orders)}` }),
          }),
          statTile({
            label: 'Faturamento projetado', icon: '💰',
            value: p.revenue === null ? '—' : money(p.revenue),
            sub: h('span', { class: 'muted', text: `realizado: ${money(vm.performance.revenue)}` }),
          })),
    !awaiting && !waitingPace
      ? h('p', { class: 'projection-note', text: projectionNote(p.revenueModel) })
      : null);
}

function projectionNote(model) {
  switch (model) {
    case 'blend': return 'Projeção combinando o ritmo de hoje com a curva do dia anterior.';
    case 'curve': return 'Projeção baseada na forma do dia anterior.';
    case 'linear-fallback': return 'Projeção pelo ritmo atual — ainda não há dia anterior comparável.';
    case 'sem-producao': return 'Sem produção registrada até agora.';
    default: return 'Projeção pelo ritmo atual.';
  }
}

// ----------------------------------------------------------------- gráfico
function chartSection({ vm, config, app, awaiting }) {
  const metric = app.state.metric;
  const toggle = h('div', { class: 'seg', role: 'group', 'aria-label': 'Indicador do gráfico' },
    h('button', {
      class: ['seg-btn', metric === 'revenue' && 'seg-on'],
      onclick: () => app.setMetric('revenue'), text: 'Faturamento',
    }),
    h('button', {
      class: ['seg-btn', metric === 'orders' && 'seg-on'],
      onclick: () => app.setMetric('orders'), text: 'Pedidos',
    }));

  const semCurvaPropria = !vm.charts.mine.length;
  const body = awaiting
    ? waitingBlock({ compact: true, title: 'Sem curva para desenhar', detail: 'O gráfico aparece quando a base de dados for conectada.' })
    : semCurvaPropria && !vm.charts.yesterday.length
      ? h('p', { class: 'muted', text: 'Nenhum pedido registrado hoje e nenhum registro de ontem para comparar. Sua linha começa no primeiro pedido.' })
      : app.state.chartAsTable
      ? dayChartTable({ today: vm.charts.mine, yesterday: vm.charts.yesterday, metric })
      : dayChart({
        today: vm.charts.mine,
        yesterday: vm.charts.yesterday,
        metric,
        businessHours: config.businessHours,
        nowMinutes: vm.atMinutes,
        labelToday: 'Hoje',
        labelYesterday: 'Ontem',
      });

  const aviso = !awaiting && semCurvaPropria && vm.charts.yesterday.length
    ? h('p', { class: 'muted', text: 'Sua linha de hoje ainda não começou. A curva pontilhada é a de ontem — é ela que você precisa passar.' })
    : null;

  return h('section', { class: 'card' },
    sectionTitle('Evolução no dia', toggle),
    h('div', { class: 'legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-today' }), 'Hoje'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-yesterday' }), 'Ontem'),
      h('button', {
        class: 'btn btn-ghost btn-sm legend-table-btn',
        onclick: () => app.toggleChartTable(),
        text: app.state.chartAsTable ? 'Ver gráfico' : 'Ver tabela',
      })),
    aviso,
    body);
}

// -------------------------------------------------------------------- nível
function tierSection({ vm, awaiting }) {
  const t = vm.tier;
  if (awaiting) {
    return h('section', { class: 'card' },
      sectionTitle('Nível do dia'),
      waitingBlock({ compact: true, title: 'Nível indefinido', detail: 'O nível do dia depende dos pedidos e do faturamento realizados.' }));
  }
  return h('section', { class: 'card' },
    sectionTitle('Nível do dia', tierBadge(t, { size: 'lg' })),
    t.next
      ? progressBar({
        value: t.progress,
        label: `Rumo a ${t.next.name}`,
        caption: t.missingRevenue > 0 || t.missingOrders > 0
          ? `Faltam ${money(t.missingRevenue)}${t.missingOrders > 0 ? ` e ${number(t.missingOrders)} ${t.missingOrders === 1 ? 'pedido' : 'pedidos'}` : ''}.`
          : 'Nível alcançado.',
      })
      : h('p', { class: 'muted', text: 'Nível máximo da escala alcançado hoje.' }),
    h('div', { class: 'tier-scale' }, (vm.tier.total ? Array.from({ length: vm.tier.total }) : []).map((_, i) => h('span', {
      class: ['tier-step', i <= vm.tier.index && 'tier-step-on'],
      'aria-hidden': 'true',
    }))));
}

// ------------------------------------------------------------------ equipe
function teamSection({ vm, awaiting }) {
  if (!vm.team.visible) {
    return h('section', { class: 'card card-muted' },
      sectionTitle('Resultado geral da equipe'),
      vm.team.reason === 'aguardando-base'
        ? waitingBlock({ compact: true, title: 'Totais aguardando', detail: 'O resultado geral da equipe aparece quando a base de dados for conectada.' })
        : h('p', { class: 'muted', text: vm.team.reason === 'equipe-pequena'
          ? 'O total da equipe fica oculto quando há poucos vendedores ativos: com um grupo pequeno, uma soma revelaria o número individual de alguém.'
          : 'A exibição do total da equipe está desativada na configuração.' }));
  }
  return h('section', { class: 'card' },
    sectionTitle('Resultado geral da equipe', h('span', { class: 'section-hint', text: 'somente totais' })),
    awaiting
      ? waitingBlock({ compact: true, title: 'Sem totais ainda', detail: 'Os totais da equipe dependem da base de dados.' })
      : h('div', {}, h('div', { class: 'team-grid' },
        statTile({ label: 'Pedidos da equipe', value: number(vm.team.orders), icon: '📦' }),
        statTile({ label: 'Faturamento da equipe', value: money(vm.team.revenue), icon: '💰' }),
        statTile({ label: 'Vendedores ativos', value: `${number(vm.team.activeCount)} de ${number(vm.team.sellerCount)}`, icon: '👥' }),
        statTile({
          label: 'Sua fatia do faturamento',
          value: vm.team.myShareOfRevenue === null ? '—' : `${Math.round(vm.team.myShareOfRevenue * 100)}%`,
          icon: '🎯',
        })),
      h('p', { class: 'privacy-note' },
        h('span', { 'aria-hidden': 'true', text: '🔒' }),
        'Apenas somas da equipe. Nenhum resultado individual de colega é exibido aqui.')));
}

// ------------------------------------------------------------------ rodapé
function footer({ vm, app }) {
  return h('footer', { class: 'app-footer' },
    h('span', { class: 'muted', text: `Atualizado às ${timeFromMinutes(vm.atMinutes)}` }),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.refresh(), text: '↻ Atualizar' }),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.logout(), text: 'Sair' }));
}

// ---------------------------------------------------------- modo compacto
function compactView({ vm, app, awaiting }) {
  const next = vm.gaps?.toNext;
  const paceStatus = vm.performance.pace?.revenueStatus?.status;
  const top = vm.messages[0] ?? null;

  return h('div', { class: 'view view-compact' },
    h('div', { class: 'compact-bar' },
      h('span', { class: 'compact-name', text: vm.identity.sellerName ?? '' }),
      h('button', {
        class: 'btn btn-ghost btn-xs', title: 'Voltar ao painel completo',
        onclick: () => app.toggleCompact(), text: '⛶',
      })),
    h('div', { class: 'compact-position' },
      h('span', { class: 'compact-pos-value', text: awaiting ? '—' : ordinal(vm.gaps?.position) }),
      h('span', { class: 'compact-pos-label', text: vm.gaps?.total ? `de ${number(vm.gaps.total)}` : 'lugar' })),
    h('div', { class: 'compact-stats' },
      h('div', { class: 'compact-stat' },
        h('span', { class: 'compact-stat-label', text: 'Pedidos' }),
        h('span', { class: 'compact-stat-value', text: awaiting ? '—' : number(vm.performance.orders) })),
      h('div', { class: 'compact-stat' },
        h('span', { class: 'compact-stat-label', text: 'Faturamento' }),
        h('span', { class: 'compact-stat-value', text: awaiting ? '—' : money(vm.performance.revenue) }))),
    !awaiting && next
      ? h('div', { class: 'compact-gap' },
        h('span', { 'aria-hidden': 'true', text: '⚔️' }),
        h('span', { text: next.revenue > 0 ? `${money(next.revenue)} para avançar` : 'Empate na próxima posição' }))
      : null,
    !awaiting && paceStatus
      ? h('div', { class: ['compact-pace', paceStatus === 'abaixo' || paceStatus === 'parado' ? 'tone-warn' : 'tone-good'] },
        h('span', { 'aria-hidden': 'true', text: paceStatus === 'abaixo' || paceStatus === 'parado' ? '⚡' : '🎯' }),
        h('span', { text: paceStatus === 'abaixo' ? 'Acelere o ritmo' : paceStatus === 'parado' ? 'Placar zerado' : 'Ritmo em dia' }))
      : null,
    top ? h('div', { class: 'compact-message', text: `${top.icon} ${top.text}` }) : null,
    awaiting ? h('div', { class: 'compact-waiting', text: '⏳ Aguardando a base de dados' }) : null,
    h('div', { class: 'compact-footer' },
      h('span', { class: 'muted', text: timeFromMinutes(vm.atMinutes) }),
      h('button', { class: 'btn btn-ghost btn-xs', onclick: () => app.refresh(), text: '↻' })));
}
