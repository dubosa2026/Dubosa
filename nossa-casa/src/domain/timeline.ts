// Horário de execução de cada tarefa do dia.
// Tarefas com horário marcado ficam onde estão; as demais recebem um horário
// sugerido dentro dos períodos em que a pessoa está em casa (manhã/noite),
// uma depois da outra, sem sobrepor as de horário fixo. É calculado na hora
// (não é gravado), então se a pessoa concluir, adiar ou trocar tarefas, a
// agenda do dia se ajusta sozinha.
import { timeToMinutes, weekday } from './dates';
import type { ISODate, Member, Slot, TaskInstance } from './types';

const SLOT_RANGE: Record<Exclude<Slot, 'any'>, [number, number]> = {
  morning: [5 * 60, 12 * 60],
  afternoon: [12 * 60, 18 * 60],
  evening: [18 * 60, 24 * 60],
};

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface TimedTask {
  time: string;
  suggested: boolean;
}

/** Horários (marcados ou sugeridos) das tarefas de uma pessoa num dia. */
export function suggestTimes(member: Member | undefined, date: ISODate, tasks: TaskInstance[]): Map<string, TimedTask> {
  const out = new Map<string, TimedTask>();
  const busy: [number, number][] = [];
  for (const t of tasks) {
    if (t.due_time) {
      const s = timeToMinutes(t.due_time);
      out.set(t.id, { time: t.due_time, suggested: false });
      busy.push([s, s + t.minutes]);
    }
  }
  const sched = member?.schedule?.[weekday(date)];
  // Sem agenda (crianças) ou fora de casa o dia todo: sem sugestão.
  const blocks = (sched?.home ?? [])
    .map((b) => [timeToMinutes(b.start), timeToMinutes(b.end)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (!blocks.length) return out;

  const free = (start: number, len: number) => !busy.some(([a, b]) => start < b && start + len > a);
  const order = { morning: 0, afternoon: 1, evening: 2, any: 3 } as const;
  const prio = { high: 0, medium: 1, low: 2 } as const;
  const flexible = tasks
    .filter((t) => !t.due_time)
    .sort((a, b) => order[a.slot] - order[b.slot] || prio[a.priority] - prio[b.priority] || b.minutes - a.minutes);

  for (const t of flexible) {
    const len = Math.max(5, t.minutes);
    // Blocos compatíveis com o turno da tarefa; "qualquer hora" usa o bloco com mais folga primeiro.
    let cands = blocks.filter(([a, b]) => t.slot === 'any' || (a < SLOT_RANGE[t.slot][1] && b > SLOT_RANGE[t.slot][0]));
    if (!cands.length) cands = blocks;
    if (t.slot === 'any') cands = [...cands].sort((x, y) => y[1] - y[0] - (x[1] - x[0]));
    let placed: number | null = null;
    for (const [a, b] of cands) {
      const lo = t.slot === 'any' ? a : Math.max(a, SLOT_RANGE[t.slot][0]);
      const hi = t.slot === 'any' ? b : Math.min(b, SLOT_RANGE[t.slot][1]);
      for (let s = Math.ceil(lo / 5) * 5; s + len <= hi; s += 5) {
        if (free(s, len)) {
          placed = s;
          break;
        }
      }
      if (placed !== null) break;
    }
    if (placed === null) {
      // Dia cheio: coloca logo depois da última tarefa do dia (a pessoa ajusta se quiser).
      placed = Math.max(...busy.map(([, b]) => b), blocks[blocks.length - 1][0]);
    }
    busy.push([placed, placed + len]);
    out.set(t.id, { time: hhmm(placed), suggested: true });
  }
  return out;
}
