// "Aprender com o uso": sugestões que o app mostra, mas NUNCA aplica sozinho.
import { addDays } from './dates';
import type { ActivityLog, ISODate, TaskInstance, TaskTemplate } from './types';

export type Suggestion =
  | { kind: 'postponed'; template: TaskTemplate; count: number; message: string }
  | { kind: 'estimate'; template: TaskTemplate; actualMinutes: number; message: string };

/**
 * Tarefas adiadas com frequência (>= 3 adiamentos nos últimos 45 dias).
 * Considera o contador de adiamentos das ocorrências e o histórico de transferências.
 */
export function postponeSuggestions(
  templates: TaskTemplate[], instances: TaskInstance[], logs: ActivityLog[], today: ISODate, dismissed: string[] = [],
): Suggestion[] {
  const since = addDays(today, -45);
  const out: Suggestion[] = [];
  for (const t of templates) {
    if (t.deleted || !t.active || t.kind === 'mission' || dismissed.includes(`postponed:${t.id}`)) continue;
    const inst = instances.filter((i) => i.template_id === t.id && i.date >= since);
    const byCounter = inst.reduce((s, i) => s + i.postponed_count, 0);
    const ids = new Set(inst.map((i) => i.id));
    const byLog = logs.filter((l) => l.action === 'postponed' && ids.has(l.entity_id) && l.created_at.slice(0, 10) >= since).length;
    const count = Math.max(byCounter, byLog);
    if (count >= 3) {
      out.push({
        kind: 'postponed',
        template: t,
        count,
        message: `"${t.title}" está sendo adiada frequentemente. Deseja aumentar o intervalo ou alterar o responsável?`,
      });
    }
  }
  return out;
}

/** Quando o cronômetro mostra que a tarefa leva bem mais (ou menos) tempo do que o estimado. */
export function estimateSuggestions(templates: TaskTemplate[], instances: TaskInstance[], dismissed: string[] = []): Suggestion[] {
  const out: Suggestion[] = [];
  for (const t of templates) {
    if (t.deleted || dismissed.includes(`estimate:${t.id}`)) continue;
    const samples = instances
      .filter((i) => i.template_id === t.id && i.status === 'done' && i.actual_seconds >= 60)
      .map((i) => i.actual_seconds / 60)
      .sort((a, b) => a - b);
    if (samples.length < 3) continue;
    const median = samples[Math.floor(samples.length / 2)];
    const rounded = Math.max(5, Math.round(median / 5) * 5);
    if (Math.abs(rounded - t.minutes) / t.minutes >= 0.25 && rounded !== t.minutes) {
      out.push({
        kind: 'estimate',
        template: t,
        actualMinutes: rounded,
        message: `"${t.title}" tem levado cerca de ${rounded} min (estimativa atual: ${t.minutes} min). Atualizar a estimativa melhora o planejamento.`,
      });
    }
  }
  return out;
}

/** Próximo intervalo sugerido ao "aumentar o intervalo" de uma tarefa adiada. */
export function relaxedRecurrence(t: TaskTemplate): TaskTemplate['recurrence'] {
  const r = t.recurrence;
  switch (r.type) {
    case 'daily': return { ...r, type: 'every_x_days', interval: 2, weekdays: undefined };
    case 'custom': return { ...r, type: 'weekly', weekdays: r.weekdays?.slice(0, 1) };
    case 'weekly': return { ...r, type: 'biweekly', weekdays: undefined };
    case 'biweekly': return { ...r, type: 'monthly', weekdays: undefined };
    case 'monthly': return { ...r, type: 'every_x_days', interval: 45 };
    case 'every_x_days': return { ...r, interval: Math.round((r.interval ?? 1) * 1.5) };
    default: return r;
  }
}
