// "Equilíbrio da semana": mostra se a carga está bem distribuída.
// Não é placar: não há vencedor, ranking nem comparação de pontos entre o casal.
import { weekDates } from './dates';
import { counts, instanceLoad } from './planner';
import type { Household, ISODate, Member, TaskInstance } from './types';

export interface MemberLoad {
  member: Member;
  minutes: number; // tempo estimado (todas as tarefas da semana, feitas ou não)
  weighted: number; // considerando o esforço
  done: number;
  pending: number;
  coverage: number; // minutos em "cobertura das crianças"
  expectedShare: number;
  actualShare: number;
}

export interface WeekBalance {
  members: MemberLoad[];
  totalMinutes: number;
  differencePct: number;
  balanced: boolean;
  title: string;
  message: string;
}

export function weekBalance(instances: TaskInstance[], members: Member[], h: Household, week: ISODate): WeekBalance {
  const days = new Set(weekDates(week));
  const adults = members.filter((m) => m.kind === 'adult' && !m.deleted).sort((a, b) => a.sort - b.sort);
  const inWeek = instances.filter((i) => days.has(i.date) && counts(i) && i.kind !== 'mission');
  const shareSum = adults.reduce((s, a) => s + (h.settings.target_share[a.id] ?? 1 / adults.length), 0) || 1;
  const rows: MemberLoad[] = adults.map((m) => {
    const mine = inWeek.filter((i) => i.assignee_ids.includes(m.id));
    const chores = mine.filter((i) => i.kind !== 'coverage');
    return {
      member: m,
      minutes: chores.reduce((s, i) => s + i.minutes, 0),
      weighted: mine.reduce((s, i) => s + instanceLoad(i, h), 0),
      done: mine.filter((i) => i.status === 'done').length,
      pending: mine.filter((i) => i.status === 'pending').length,
      coverage: mine.filter((i) => i.kind === 'coverage').reduce((s, i) => s + i.minutes, 0),
      expectedShare: (h.settings.target_share[m.id] ?? 1 / adults.length) / shareSum,
      actualShare: 0,
    };
  });
  const totalW = rows.reduce((s, r) => s + r.weighted, 0);
  for (const r of rows) r.actualShare = totalW ? r.weighted / totalW : r.expectedShare;
  // Diferença entre a divisão real e a combinada, em pontos percentuais.
  const differencePct = rows.length ? Math.round(Math.max(...rows.map((r) => Math.abs(r.actualShare - r.expectedShare))) * 200) : 0;
  const balanced = differencePct <= h.settings.balance_tolerance;
  return {
    members: rows,
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    differencePct,
    balanced,
    title: totalW === 0 ? 'Semana sem tarefas' : balanced ? 'Distribuição equilibrada' : 'Vale a pena olhar a divisão',
    message: totalW === 0
      ? 'Ainda não há tarefas planejadas para esta semana.'
      : balanced
        ? 'A carga desta semana está bem dividida entre vocês. 💚'
        : 'Há uma diferença significativa na carga de tarefas. Considere redistribuir algumas atividades.',
  };
}
