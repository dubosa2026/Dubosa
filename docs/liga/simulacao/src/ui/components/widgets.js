import { h } from '../dom.js';
import {
  money, moneyDelta, number, numberDelta, percentDelta, percent, ordinal,
  moneyRate, decimal, timeFromMinutes, durationFromMinutes, initials,
} from '../../core/format.js';

/**
 * Peças reutilizáveis da interface.
 *
 * Regra de acessibilidade seguida em todas: nenhuma informação é transmitida
 * só por cor. Toda variação carrega seta + sinal + rótulo.
 */

/** Cartão de indicador. `hero` aumenta o número para leitura à distância. */
export function statTile({
  label, value, sub = null, hero = false, tone = 'neutral', icon = null, title = null,
}) {
  return h('div', { class: ['stat', hero && 'stat-hero', `tone-${tone}`], title },
    h('div', { class: 'stat-label' }, icon ? h('span', { class: 'stat-icon', text: icon }) : null, label),
    h('div', { class: 'stat-value', text: value }),
    sub ? h('div', { class: 'stat-sub' }, sub) : null);
}

/**
 * Variação com dupla codificação: seta (forma) + sinal (texto) + cor.
 * @param {'up'|'down'|'flat'} direction
 */
export function deltaBadge(direction, text, { size = 'md' } = {}) {
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■';
  const word = direction === 'up' ? 'acima' : direction === 'down' ? 'abaixo' : 'igual';
  return h('span', {
    class: ['delta', `delta-${direction}`, size === 'sm' && 'delta-sm'],
    title: `${text} (${word})`,
  }, h('span', { class: 'delta-arrow', 'aria-hidden': 'true', text: arrow }), h('span', { text }));
}

/** Comparação completa: absoluto + percentual, no formato da especificação. */
export function comparison(cmp, kind = 'revenue') {
  if (!cmp) return h('span', { class: 'muted', text: '—' });
  // Sem dia anterior medido não existe variação a mostrar: exibir a produção
  // inteira como "+R$ 370.000 em relação a ontem" seria inventar crescimento.
  if (cmp.semBase) {
    return h('span', { class: 'muted', title: 'Não há registro do dia anterior para comparar', text: 'sem base para comparar' });
  }
  if (!cmp.current && !cmp.baseline) {
    return h('span', { class: 'muted', text: 'sem base para comparar' });
  }
  const abs = kind === 'revenue' ? moneyDelta(cmp.abs) : numberDelta(cmp.abs);
  const pct = cmp.pct === null ? null : percentDelta(cmp.pct);
  return h('span', { class: 'comparison' },
    deltaBadge(cmp.direction, abs),
    pct ? h('span', { class: 'comparison-pct', text: pct }) : null);
}

/** Barra de progresso rotulada (meta, nível). */
export function progressBar({ value, label = null, caption = null, tone = 'accent' }) {
  const pct = Math.min(1, Math.max(0, value ?? 0));
  return h('div', { class: 'progress-block' },
    label ? h('div', { class: 'progress-head' }, h('span', { text: label }), h('span', { class: 'progress-pct', text: percent(pct) })) : null,
    h('div', {
      class: 'progress-track',
      role: 'progressbar',
      'aria-valuenow': Math.round(pct * 100),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': label ?? 'progresso',
    }, h('div', { class: ['progress-fill', `progress-${tone}`], style: { width: `${pct * 100}%` } })),
    caption ? h('div', { class: 'progress-caption', text: caption }) : null);
}

/** Selo de nível — sempre acompanhado do nome, nunca só a cor. */
export function tierBadge(tier, { size = 'md' } = {}) {
  if (!tier?.current) return null;
  return h('span', {
    class: ['tier', `tier-${tier.current.id}`, size === 'lg' && 'tier-lg'],
    title: `Nível ${tier.current.name}`,
  }, h('span', { class: 'tier-dot', 'aria-hidden': 'true' }), tier.current.name);
}

/** Posição em destaque. */
export function positionBadge(position, total, { delta = 0 } = {}) {
  if (!position) return h('div', { class: 'position-badge muted', text: '—' });
  return h('div', { class: ['position-badge', position === 1 && 'position-leader'] },
    h('div', { class: 'position-crown', 'aria-hidden': 'true', text: position === 1 ? '🏆' : '📍' }),
    h('div', { class: 'position-main' },
      h('div', { class: 'position-value', text: ordinal(position) }),
      h('div', { class: 'position-total', text: total ? `de ${number(total)}` : 'lugar' })),
    delta !== 0
      ? h('div', { class: ['position-delta', delta > 0 ? 'delta-up' : 'delta-down'] },
        h('span', { 'aria-hidden': 'true', text: delta > 0 ? '▲' : '▼' }),
        `${Math.abs(delta)}`)
      : null);
}

/** Lista de mensagens motivacionais. */
export function messageList(messages = []) {
  if (!messages.length) return null;
  return h('ul', { class: 'messages' }, messages.map((msg) => h('li', {
    class: ['message', `message-${msg.tone}`],
  }, h('span', { class: 'message-icon', 'aria-hidden': 'true', text: msg.icon }), h('span', { text: msg.text }))));
}

/** Grade de conquistas do dia. */
export function achievementGrid(achievements = []) {
  return h('div', { class: 'achievements' }, achievements.map((a) => h('div', {
    class: ['achievement', a.unlocked ? 'achievement-on' : 'achievement-off'],
    title: a.unlocked && a.atMinutes != null ? `Conquistada às ${timeFromMinutes(a.atMinutes)}` : a.hint,
  },
  h('span', { class: 'achievement-icon', 'aria-hidden': 'true', text: a.icon }),
  h('span', { class: 'achievement-name', text: a.name }),
  h('span', {
    class: 'achievement-state',
    text: a.unlocked ? (a.atMinutes != null ? timeFromMinutes(a.atMinutes) : 'conquistada') : 'bloqueada',
  }))));
}

/**
 * Painel de ritmo.
 *
 * `temFaturamento: false` — a origem não informa faturamento por vendedor.
 * A linha de reais some, e o julgamento do ritmo passa a olhar os pedidos:
 * `revenueStatus` seria sempre "parado", e o painel diria "sem produção ainda"
 * ao lado de treze pedidos feitos.
 */
export function pacePanel(performance, { temFaturamento = true } = {}) {
  const p = performance?.pace;
  if (!p) return null;
  const statusText = {
    acima: 'Acima do necessário',
    'no-ritmo': 'No ritmo da meta',
    abaixo: 'Abaixo do necessário',
    'meta-atingida': 'Meta do dia batida',
    parado: 'Sem produção ainda',
    'sem-tempo': 'Expediente encerrado',
  };
  const tone = {
    acima: 'good', 'no-ritmo': 'good', abaixo: 'warn', 'meta-atingida': 'good', parado: 'warn', 'sem-tempo': 'neutral',
  };
  const status = (temFaturamento ? p.revenueStatus?.status : p.ordersStatus?.status) ?? 'parado';
  return h('div', { class: 'pace-panel' },
    h('div', { class: 'pace-row' },
      h('span', { class: 'pace-label', text: 'Ritmo de pedidos' }),
      h('span', { class: 'pace-value', text: `${decimal(p.orders)} /hora` })),
    temFaturamento
      ? h('div', { class: 'pace-row' },
        h('span', { class: 'pace-label', text: 'Ritmo de faturamento' }),
        h('span', { class: 'pace-value', text: moneyRate(p.revenue) }))
      : null,
    h('div', { class: ['pace-status', `tone-${tone[status] ?? 'neutral'}`] },
      h('span', { 'aria-hidden': 'true', text: status === 'abaixo' || status === 'parado' ? '⚡' : '🎯' }),
      h('span', { text: statusText[status] ?? '—' })));
}

/** Cabeçalho de seção. */
export function sectionTitle(text, right = null) {
  return h('div', { class: 'section-title' }, h('h2', { text }), right);
}

/** Avatar com iniciais (usado só no painel do gestor). */
export function avatar(name) {
  return h('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(name) });
}

/** Relógio do expediente. */
export function businessClock({ phase, elapsedMinutes, remainingMinutes, atMinutes }) {
  const phaseText = {
    antes: 'Antes da abertura', aberto: 'Expediente aberto', intervalo: 'Intervalo', encerrado: 'Expediente encerrado',
  };
  return h('div', { class: 'biz-clock' },
    h('span', { class: ['biz-dot', `biz-${phase}`], 'aria-hidden': 'true' }),
    h('span', { class: 'biz-time', text: timeFromMinutes(atMinutes) }),
    h('span', { class: 'biz-phase', text: phaseText[phase] ?? '' }),
    phase === 'aberto' || phase === 'intervalo'
      ? h('span', { class: 'biz-remaining', text: `faltam ${durationFromMinutes(remainingMinutes)}` })
      : null);
}

export { money, number, ordinal, percent };
