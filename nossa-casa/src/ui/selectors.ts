import { useMemo } from 'react';
import { useNC } from '../data/app';
import { today } from '../domain/dates';
import { PRIORITY_INFO } from '../domain/categories';
import { suggestTimes, type TimedTask } from '../domain/timeline';
import type { Member, TaskInstance } from '../domain/types';

export const visible = (i: TaskInstance) => !i.deleted && i.status !== 'cancelled' && i.status !== 'skipped';

export function sortTasks(a: TaskInstance, b: TaskInstance) {
  const done = Number(a.status === 'done') - Number(b.status === 'done');
  if (done) return done;
  const ta = a.due_time ?? '99:99';
  const tb = b.due_time ?? '99:99';
  if (ta !== tb) return ta.localeCompare(tb);
  return PRIORITY_INFO[a.priority].order - PRIORITY_INFO[b.priority].order || a.title.localeCompare(b.title);
}

export function useAdults() {
  const members = useNC((s) => s.members);
  return useMemo(() => members.filter((m) => m.kind === 'adult' && !m.deleted).sort((a, b) => a.sort - b.sort), [members]);
}

export function useKids() {
  const members = useNC((s) => s.members);
  return useMemo(() => members.filter((m) => m.kind === 'child' && !m.deleted).sort((a, b) => a.sort - b.sort), [members]);
}

export function useToday() {
  return today();
}

export function isLate(i: TaskInstance, t = today()) {
  return i.status === 'pending' && i.date < t;
}

function computeTimes(instances: TaskInstance[], members: Member[], dates: string[]): Map<string, TimedTask> {
  const out = new Map<string, TimedTask>();
  for (const date of dates) {
    const day = instances.filter((i) => visible(i) && i.date === date && i.kind !== 'mission');
    for (const m of members.filter((x) => x.kind === 'adult' && !x.deleted)) {
      const mine = day.filter((i) => i.assignee_ids.includes(m.id) && i.kind !== 'coverage');
      for (const [id, t] of suggestTimes(m, date, mine)) if (!out.has(id)) out.set(id, t);
    }
    // Cobertura das crianças acontece junto com a tarefa do outro.
    for (const c of day.filter((i) => i.kind === 'coverage')) {
      const pair = c.group_id ? out.get(c.group_id) : undefined;
      if (pair) out.set(c.id, pair);
    }
  }
  return out;
}

/** Horário (marcado ou sugerido) de cada tarefa dos dias pedidos, para todos os adultos. */
export function useTimes(dates: string[]): Map<string, TimedTask> {
  const instances = useNC((s) => s.instances);
  const members = useNC((s) => s.members);
  const key = dates.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeTimes(instances, members, dates), [instances, members, key]);
}

export function useDayTimes(date: string): Map<string, TimedTask> {
  return useTimes([date]);
}

export function byTime(times: Map<string, TimedTask>) {
  return (a: TaskInstance, b: TaskInstance) => {
    const done = Number(a.status === 'done') - Number(b.status === 'done');
    if (done) return done;
    const ta = times.get(a.id)?.time ?? '99:99';
    const tb = times.get(b.id)?.time ?? '99:99';
    return ta.localeCompare(tb) || sortTasks(a, b);
  };
}
