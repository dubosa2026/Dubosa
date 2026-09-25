// Recorrência: quais ocorrências de um modelo de tarefa caem numa semana.
// Tarefas diárias/de dia fixo têm data fixa. As demais (semanal, quinzenal,
// mensal, a cada X dias) têm uma data "nominal" e uma janela de dias em que o
// planejador pode encaixá-las, para distribuir a carga sem sobrecarregar um dia.
import { addDays, diffDays, fromISO, monthKey, weekDates, weekStart, weekday } from './dates';
import type { ISODate, Recurrence, RecurrenceType, TaskTemplate, Weekday } from './types';

export interface Occurrence {
  key: string;
  nominal: ISODate;
  window: ISODate[];
  fixed: boolean;
}

const DEFAULT_ANCHOR = '2026-01-05'; // uma segunda-feira

export function occurrencesInWeek(tpl: Pick<TaskTemplate, 'recurrence' | 'created_at'>, week: ISODate): Occurrence[] {
  const r = tpl.recurrence;
  const days = weekDates(week);
  const start = r.start ?? (tpl.created_at ? tpl.created_at.slice(0, 10) : DEFAULT_ANCHOR);
  const notBeforeStart = (d: ISODate) => d >= start || r.type === 'once';
  const fixedOn = (d: ISODate): Occurrence => ({ key: `D${d}`, nominal: d, window: [d], fixed: true });
  const wds = r.weekdays && r.weekdays.length ? r.weekdays : null;

  switch (r.type) {
    case 'once': {
      if (r.date) return days.includes(r.date) ? [{ key: 'once', nominal: r.date, window: [r.date], fixed: true }] : [];
      const home = weekStart(start);
      return home <= week ? [{ key: 'once', nominal: days[0], window: days, fixed: false }] : [];
    }
    case 'daily':
    case 'custom':
      return days.filter((d) => notBeforeStart(d) && (!wds || wds.includes(weekday(d)))).map(fixedOn);
    case 'weekly': {
      if (wds) return days.filter((d) => notBeforeStart(d) && wds.includes(weekday(d))).map(fixedOn);
      const window = days.filter(notBeforeStart);
      return window.length ? [{ key: `W${week}`, nominal: window[0], window, fixed: false }] : [];
    }
    case 'biweekly': {
      const k = Math.round(diffDays(week, weekStart(start)) / 7);
      if (k < 0 || k % 2 !== 0) return [];
      if (wds) {
        const d = days.find((x) => wds.includes(weekday(x)) && notBeforeStart(x));
        return d ? [{ ...fixedOn(d), key: `B${week}` }] : [];
      }
      const window = days.filter(notBeforeStart);
      return window.length ? [{ key: `B${week}`, nominal: window[0], window, fixed: false }] : [];
    }
    case 'monthly': {
      const dom = fromISO(start).getDate();
      for (const d of days) {
        if (d < start) continue;
        const dt = fromISO(d);
        const lastDom = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        if (dt.getDate() === Math.min(dom, lastDom)) {
          return [{ key: `M${monthKey(d)}`, nominal: d, window: days.filter(notBeforeStart), fixed: false }];
        }
      }
      return [];
    }
    case 'every_x_days': {
      const interval = Math.max(1, r.interval ?? 1);
      const out: Occurrence[] = [];
      for (const d of days) {
        const n = diffDays(d, start);
        if (n < 0 || n % interval !== 0) continue;
        const k = n / interval;
        const window = interval >= 3 ? [addDays(d, -1), d, addDays(d, 1)].filter((x) => days.includes(x) && x >= start) : [d];
        out.push({ key: `X${k}`, nominal: d, window, fixed: window.length === 1 });
      }
      return out;
    }
  }
}

export const RECURRENCE_LABEL: Record<RecurrenceType, string> = {
  once: 'Uma vez',
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  biweekly: 'Quinzenalmente',
  monthly: 'Mensalmente',
  every_x_days: 'A cada X dias',
  custom: 'Personalizado',
};

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function describeRecurrence(r: Recurrence): string {
  const days = r.weekdays && r.weekdays.length ? ` (${r.weekdays.map((d) => WD[d]).join(', ')})` : '';
  if (r.type === 'every_x_days') return `A cada ${r.interval ?? 1} dias`;
  if (r.type === 'once') return r.date ? `Uma vez (${r.date.split('-').reverse().join('/')})` : 'Uma vez';
  if (r.type === 'daily' && !days) return 'Todos os dias';
  return RECURRENCE_LABEL[r.type] + days;
}

/** Aproximação de quantas vezes por semana a tarefa acontece (usada para sugerir frequência e estimar carga). */
export function timesPerWeek(r: Recurrence): number {
  const n = r.weekdays?.length || 0;
  switch (r.type) {
    case 'once': return 0;
    case 'daily': return n || 7;
    case 'custom': return n || 1;
    case 'weekly': return n || 1;
    case 'biweekly': return 0.5;
    case 'monthly': return 12 / 52;
    case 'every_x_days': return 7 / Math.max(1, r.interval ?? 1);
  }
}

export const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
