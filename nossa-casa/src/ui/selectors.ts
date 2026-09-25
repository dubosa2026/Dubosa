import { useMemo } from 'react';
import { useNC } from '../data/app';
import { today } from '../domain/dates';
import { PRIORITY_INFO } from '../domain/categories';
import type { TaskInstance } from '../domain/types';

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
