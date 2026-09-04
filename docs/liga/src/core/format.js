/**
 * Formatação pt-BR. Todas as saídas visíveis ao usuário passam por aqui.
 */

const LOCALE = 'pt-BR';

const brl = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const brlCents = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ 126.500 */
export function money(value) {
  if (!Number.isFinite(value)) return '—';
  return brl.format(value);
}

/** R$ 126.500,00 */
export function moneyExact(value) {
  if (!Number.isFinite(value)) return '—';
  return brlCents.format(value);
}

/** +R$ 21.400 / -R$ 4.000 */
export function moneyDelta(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return sign + brl.format(Math.abs(value));
}

/** 14 */
export function number(value) {
  if (!Number.isFinite(value)) return '—';
  return int.format(value);
}

/** +3 / -2 */
export function numberDelta(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return sign + int.format(Math.abs(value));
}

/** 1,2 */
export function decimal(value, places = 1) {
  if (!Number.isFinite(value)) return '—';
  return (places === 2 ? dec2 : dec1).format(value);
}

/** +36,1% */
export function percentDelta(ratio) {
  if (!Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${dec1.format(Math.abs(pct))}%`;
}

/** 18% */
export function percent(ratio, places = 0) {
  if (!Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  return places === 0 ? `${int.format(pct)}%` : `${dec1.format(pct)}%`;
}

/** 1º, 2º, 3º */
export function ordinal(position) {
  if (!Number.isFinite(position) || position <= 0) return '—';
  return `${int.format(position)}º`;
}

/** R$ 9.500/h */
export function moneyRate(perHour) {
  if (!Number.isFinite(perHour)) return '—';
  return `${brl.format(perHour)}/h`;
}

/** 1,2 pedido/hora */
export function orderRate(perHour) {
  if (!Number.isFinite(perHour)) return '—';
  const n = dec1.format(perHour);
  return `${n} ${Math.abs(perHour) === 1 ? 'pedido' : 'pedidos'}/hora`;
}

/** 'YYYY-MM-DD' -> '03/09/2026' */
export function dateBR(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).split('-');
  if (!y || !m || !d) return String(isoDate);
  return `${d}/${m}/${y}`;
}

/** 'YYYY-MM-DD' -> 'quinta-feira, 03/09' */
export function dateLongBR(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return String(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'UTC' }).format(dt);
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** minutos desde 00:00 -> '14:30' */
export function timeFromMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** '2h 15min' */
export function durationFromMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}min`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}min`;
}

/** Nome curto para exibição compacta: 'João Pedro Silva' -> 'João S.' */
export function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Iniciais para avatar: 'João Silva' -> 'JS' */
export function initials(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
