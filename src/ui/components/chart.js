import { h } from '../dom.js';
import { money, number, timeFromMinutes } from '../../core/format.js';
import { hourTicks, toMinutes } from '../../core/clock.js';

/**
 * CURVA DO DIA — acumulado de HOJE contra o mesmo horário de ONTEM.
 *
 * Uma medida por gráfico, um eixo só: faturamento OU pedidos, nunca os dois
 * empilhados em escalas diferentes.
 *
 * Como a produção acumulada só muda quando existe medição, a linha é desenhada
 * em DEGRAUS: ligar os pontos em diagonal sugeriria vendas em horários onde não
 * houve nenhuma.
 *
 * Codificação dupla, para não depender de cor: "Hoje" é linha cheia com área,
 * "Ontem" é linha tracejada; as duas séries recebem rótulo direto na ponta.
 */

const PAD = { top: 18, right: 54, bottom: 26, left: 50 };

function stepPath(points, x, y) {
  if (!points.length) return '';
  const seg = [`M ${x(points[0].m)} ${y(points[0].v)}`];
  for (let i = 1; i < points.length; i += 1) {
    seg.push(`H ${x(points[i].m)}`, `V ${y(points[i].v)}`);
  }
  return seg.join(' ');
}

function areaPath(points, x, y, baseline) {
  if (!points.length) return '';
  const line = stepPath(points, x, y);
  return `${line} V ${baseline} H ${x(points[0].m)} Z`;
}

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? mag * 10;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

/**
 * @param {Object} opts
 * @param {Array<{m:number, orders:number, revenue:number}>} opts.today
 * @param {Array<{m:number, orders:number, revenue:number}>} opts.yesterday
 * @param {'revenue'|'orders'} opts.metric
 * @param {Object} opts.businessHours
 * @param {number} opts.nowMinutes
 * @param {number} [opts.height]
 * @param {string} [opts.labelToday]
 * @param {string} [opts.labelYesterday]
 */
export function dayChart({
  today = [],
  yesterday = [],
  metric = 'revenue',
  businessHours,
  nowMinutes,
  height = 200,
  labelToday = 'Hoje',
  labelYesterday = 'Ontem',
}) {
  const fmt = metric === 'revenue' ? money : number;
  const open = toMinutes(businessHours?.start ?? '08:00');
  const close = toMinutes(businessHours?.end ?? '18:00');

  const seriesToday = today.map((p) => ({ m: p.m, v: p[metric] ?? 0 }));
  const seriesYesterday = yesterday.map((p) => ({ m: p.m, v: p[metric] ?? 0 }));

  const maxValue = Math.max(
    1,
    ...seriesToday.map((p) => p.v),
    ...seriesYesterday.map((p) => p.v),
  );
  const ticks = niceTicks(maxValue);
  const yMax = Math.max(maxValue, ticks.at(-1) ?? maxValue);

  const width = 640;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (m) => PAD.left + ((Math.min(Math.max(m, open), close) - open) / Math.max(1, close - open)) * plotW;
  const y = (v) => PAD.top + plotH - (v / yMax) * plotH;

  const grid = ticks.map((t) => h('g', { class: 'viz-grid' },
    h('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y(t), y2: y(t) }),
    h('text', { class: 'viz-axis-label', x: PAD.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t))));

  const xLabels = hourTicks(businessHours)
    .filter((_, i, arr) => arr.length <= 8 || i % 2 === 0)
    .map((m) => h('text', {
      class: 'viz-axis-label', x: x(m), y: height - 8, 'text-anchor': 'middle',
    }, timeFromMinutes(m)));

  const lastToday = seriesToday.at(-1) ?? null;
  const lastYesterday = seriesYesterday.at(-1) ?? null;

  const nowLine = Number.isFinite(nowMinutes) && nowMinutes > open && nowMinutes < close
    ? h('g', {},
      h('line', { class: 'viz-now', x1: x(nowMinutes), x2: x(nowMinutes), y1: PAD.top, y2: PAD.top + plotH }),
      h('text', { class: 'viz-now-label', x: x(nowMinutes), y: PAD.top - 6, 'text-anchor': 'middle' }, 'agora'))
    : null;

  const hoverGroup = h('g', { class: 'viz-hover', style: { opacity: '0' } },
    h('line', { class: 'viz-crosshair', y1: PAD.top, y2: PAD.top + plotH }),
    h('circle', { class: 'viz-dot viz-dot-today', r: 5 }),
    h('circle', { class: 'viz-dot viz-dot-yesterday', r: 5 }));

  const tooltip = h('div', { class: 'viz-tooltip', hidden: true });

  const svg = h('svg', {
    class: 'viz-svg',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': `Evolução de ${metric === 'revenue' ? 'faturamento' : 'pedidos'} no dia, hoje comparado a ontem`,
  },
  h('defs', {},
    h('linearGradient', { id: `grad-${metric}`, x1: '0', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', 'stop-color': 'var(--series-1)', 'stop-opacity': '0.28' }),
      h('stop', { offset: '100%', 'stop-color': 'var(--series-1)', 'stop-opacity': '0.02' }))),
  grid,
  xLabels,
  seriesYesterday.length
    ? h('path', { class: 'viz-line viz-line-yesterday', d: stepPath(seriesYesterday, x, y) })
    : null,
  seriesToday.length
    ? h('path', { class: 'viz-area', d: areaPath(seriesToday, x, y, PAD.top + plotH), fill: `url(#grad-${metric})` })
    : null,
  seriesToday.length
    ? h('path', { class: 'viz-line viz-line-today', d: stepPath(seriesToday, x, y) })
    : null,
  nowLine,
  lastYesterday
    ? h('text', {
      class: 'viz-direct-label viz-label-yesterday',
      x: Math.min(x(lastYesterday.m) + 6, width - 4), y: y(lastYesterday.v) + 4,
    }, labelYesterday)
    : null,
  lastToday
    ? h('text', {
      class: 'viz-direct-label viz-label-today',
      x: Math.min(x(lastToday.m) + 6, width - 4), y: y(lastToday.v) + 4,
    }, labelToday)
    : null,
  hoverGroup,
  h('rect', {
    class: 'viz-capture', x: PAD.left, y: PAD.top, width: plotW, height: plotH, fill: 'transparent',
  }));

  const wrap = h('div', { class: 'viz-wrap' }, svg, tooltip);

  // --- camada de interação -------------------------------------------------
  const valueAtMinute = (series, m) => {
    let found = null;
    for (const p of series) {
      if (p.m <= m) found = p; else break;
    }
    return found ? found.v : 0;
  };

  const capture = svg.querySelector('.viz-capture');
  const [crosshair, dotToday, dotYesterday] = hoverGroup.childNodes;

  const onMove = (event) => {
    const rect = svg.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const ratio = (clientX - rect.left) / rect.width;
    const px = ratio * width;
    if (px < PAD.left || px > PAD.left + plotW) return;
    const minute = open + ((px - PAD.left) / plotW) * (close - open);

    const vToday = valueAtMinute(seriesToday, minute);
    const vYesterday = valueAtMinute(seriesYesterday, minute);

    hoverGroup.style.opacity = '1';
    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    dotToday.setAttribute('cx', px);
    dotToday.setAttribute('cy', y(vToday));
    dotToday.style.opacity = seriesToday.length ? '1' : '0';
    dotYesterday.setAttribute('cx', px);
    dotYesterday.setAttribute('cy', y(vYesterday));
    dotYesterday.style.opacity = seriesYesterday.length ? '1' : '0';

    tooltip.hidden = false;
    tooltip.textContent = '';
    tooltip.append(
      h('div', { class: 'viz-tooltip-time', text: timeFromMinutes(minute) }),
      h('div', { class: 'viz-tooltip-row' },
        h('span', { class: 'viz-swatch viz-swatch-today' }),
        h('span', { class: 'viz-tooltip-key', text: labelToday }),
        h('span', { class: 'viz-tooltip-val', text: fmt(vToday) })),
      seriesYesterday.length
        ? h('div', { class: 'viz-tooltip-row' },
          h('span', { class: 'viz-swatch viz-swatch-yesterday' }),
          h('span', { class: 'viz-tooltip-key', text: labelYesterday }),
          h('span', { class: 'viz-tooltip-val', text: fmt(vYesterday) }))
        : null,
    );
    const left = Math.min(Math.max((px / width) * rect.width - 60, 4), rect.width - 130);
    tooltip.style.left = `${left}px`;
  };

  const onLeave = () => {
    hoverGroup.style.opacity = '0';
    tooltip.hidden = true;
  };

  capture.addEventListener('mousemove', onMove);
  capture.addEventListener('mouseleave', onLeave);
  capture.addEventListener('touchstart', onMove, { passive: true });
  capture.addEventListener('touchmove', onMove, { passive: true });
  capture.addEventListener('touchend', onLeave);

  return wrap;
}

/** Versão em tabela do mesmo gráfico — exigida como alternativa acessível. */
export function dayChartTable({ today = [], yesterday = [], metric = 'revenue' }) {
  const fmt = metric === 'revenue' ? money : number;
  const minutes = [...new Set([...today.map((p) => p.m), ...yesterday.map((p) => p.m)])].sort((a, b) => a - b);
  const at = (series, m) => {
    let found = 0;
    for (const p of series) { if (p.m <= m) found = p[metric] ?? 0; else break; }
    return found;
  };
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {},
        h('th', { text: 'Horário' }),
        h('th', { class: 'num', text: 'Hoje' }),
        h('th', { class: 'num', text: 'Ontem' }))),
      h('tbody', {}, minutes.map((m) => h('tr', {},
        h('td', { text: timeFromMinutes(m) }),
        h('td', { class: 'num', text: fmt(at(today, m)) }),
        h('td', { class: 'num', text: fmt(at(yesterday, m)) }))))));
}

/** Minigráfico de uma série, para a linha do ranking do gestor. */
export function sparkline(points, metric = 'revenue', width = 110, height = 28) {
  const values = points.map((p) => p[metric] ?? 0);
  const max = Math.max(1, ...values);
  if (!points.length) return h('span', { class: 'muted', text: '—' });
  const first = points[0].m;
  const last = points.at(-1).m;
  const span = Math.max(1, last - first);
  const x = (m) => ((m - first) / span) * (width - 2) + 1;
  const y = (v) => height - 2 - (v / max) * (height - 4);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.m).toFixed(1)} ${y(p[metric] ?? 0).toFixed(1)}`).join(' ');
  return h('svg', {
    class: 'sparkline', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true',
  }, h('path', { d, fill: 'none' }));
}
