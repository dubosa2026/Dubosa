/**
 * Relógio comercial.
 *
 * Todo cálculo de ritmo, projeção e comparação "mesmo horário de ontem"
 * depende de MINUTOS COMERCIAIS decorridos — não de minutos de relógio.
 * Intervalos (almoço), dias não úteis e feriados são descontados aqui,
 * num único lugar, para que o resto do sistema não precise saber disso.
 */

/** 'HH:mm' -> minutos desde 00:00 */
export function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return NaN;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutos -> 'HH:mm' */
export function toHHMM(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Data/hora corrente no fuso configurado, independente do fuso da máquina.
 * @returns {{date: string, time: string, minutes: number, weekday: number}}
 */
export function nowInTimezone(timeZone = 'America/Sao_Paulo', at = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const time = `${hour}:${parts.minute}`;
  return {
    date,
    time,
    minutes: Number(hour) * 60 + Number(parts.minute),
    weekday: weekdayOf(date),
  };
}

/** 'YYYY-MM-DD' -> 0 (domingo) .. 6 (sábado) */
export function weekdayOf(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Soma dias a uma data ISO, sem depender do fuso local. */
export function addDays(isoDate, delta) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function isBusinessDay(isoDate, businessHours) {
  const workdays = businessHours?.workdays ?? [1, 2, 3, 4, 5];
  const holidays = businessHours?.holidays ?? [];
  if (holidays.includes(isoDate)) return false;
  return workdays.includes(weekdayOf(isoDate));
}

/** Dia útil imediatamente anterior (pula fim de semana e feriados). */
export function previousBusinessDay(isoDate, businessHours, maxLookback = 15) {
  let cursor = isoDate;
  for (let i = 0; i < maxLookback; i += 1) {
    cursor = addDays(cursor, -1);
    if (isBusinessDay(cursor, businessHours)) return cursor;
  }
  return null;
}

/** Lista os N dias úteis anteriores, do mais recente para o mais antigo. */
export function previousBusinessDays(isoDate, businessHours, count) {
  const out = [];
  let cursor = isoDate;
  for (let i = 0; i < count; i += 1) {
    cursor = previousBusinessDay(cursor, businessHours);
    if (!cursor) break;
    out.push(cursor);
  }
  return out;
}

/** Janelas de trabalho do dia (expediente menos intervalos), em minutos. */
export function workWindows(businessHours) {
  const start = toMinutes(businessHours?.start ?? '08:00');
  const end = toMinutes(businessHours?.end ?? '18:00');
  const breaks = (businessHours?.breaks ?? [])
    .map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const windows = [];
  let cursor = start;
  for (const b of breaks) {
    const bs = Math.max(start, Math.min(end, b.start));
    const be = Math.max(start, Math.min(end, b.end));
    if (bs > cursor) windows.push({ start: cursor, end: bs });
    cursor = Math.max(cursor, be);
  }
  if (cursor < end) windows.push({ start: cursor, end });
  return windows;
}

/** Total de minutos comerciais do expediente. */
export function totalBusinessMinutes(businessHours) {
  return workWindows(businessHours).reduce((sum, w) => sum + (w.end - w.start), 0);
}

/** Minutos comerciais decorridos entre a abertura e `atMinutes`. */
export function elapsedBusinessMinutes(businessHours, atMinutes) {
  if (!Number.isFinite(atMinutes)) return 0;
  return workWindows(businessHours).reduce((sum, w) => {
    if (atMinutes <= w.start) return sum;
    return sum + Math.min(atMinutes, w.end) - w.start;
  }, 0);
}

/** Minutos comerciais restantes de `atMinutes` até o fechamento. */
export function remainingBusinessMinutes(businessHours, atMinutes) {
  return Math.max(0, totalBusinessMinutes(businessHours) - elapsedBusinessMinutes(businessHours, atMinutes));
}

/** Fração do expediente já decorrida (0..1). */
export function elapsedFraction(businessHours, atMinutes) {
  const total = totalBusinessMinutes(businessHours);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedBusinessMinutes(businessHours, atMinutes) / total));
}

/** Estado do expediente no instante informado. */
export function dayPhase(businessHours, atMinutes) {
  const start = toMinutes(businessHours?.start ?? '08:00');
  const end = toMinutes(businessHours?.end ?? '18:00');
  if (atMinutes < start) return 'antes';
  if (atMinutes >= end) return 'encerrado';
  const inBreak = (businessHours?.breaks ?? []).some(
    (b) => atMinutes >= toMinutes(b.start) && atMinutes < toMinutes(b.end),
  );
  return inBreak ? 'intervalo' : 'aberto';
}

/** Marcas de hora cheia dentro do expediente — usadas como eixo dos gráficos. */
export function hourTicks(businessHours) {
  const start = toMinutes(businessHours?.start ?? '08:00');
  const end = toMinutes(businessHours?.end ?? '18:00');
  const ticks = [];
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) ticks.push(m);
  return ticks;
}
