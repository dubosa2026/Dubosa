// Datas no fuso local, sempre como 'YYYY-MM-DD' (sem horas) para evitar surpresas de fuso.
import type { ISODate, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0); // meio-dia: imune a horário de verão
}

export function today(now: Date = new Date()): ISODate {
  return toISO(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function weekday(s: ISODate): Weekday {
  return fromISO(s).getDay() as Weekday;
}

/** Segunda-feira da semana de `s` (semana de segunda a domingo). */
export function weekStart(s: ISODate): ISODate {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}

export function weekDates(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function monthDates(s: ISODate): ISODate[] {
  const d = fromISO(s);
  const first = new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const out: ISODate[] = [];
  while (first.getMonth() === d.getMonth()) {
    out.push(toISO(first));
    first.setDate(first.getDate() + 1);
  }
  return out;
}

export function isWeekend(s: ISODate): boolean {
  const wd = weekday(s);
  return wd === 0 || wd === 6;
}

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function formatLong(s: ISODate): string {
  const d = fromISO(s);
  return `${WEEKDAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

export function formatShort(s: ISODate): string {
  const d = fromISO(s);
  return `${WEEKDAY_SHORT[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function nowISO(): string {
  return new Date().toISOString();
}
