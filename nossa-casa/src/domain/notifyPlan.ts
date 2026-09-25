// Quais notificações agendar no celular de cada pessoa (função pura, testável).
// O agendamento de fato fica em src/data/notifications.ts (expo-notifications).
import { addDays, fromISO, timeToMinutes, weekday } from './dates';
import type { FamilyEvent, Household, ISODate, Member, TaskInstance } from './types';

export interface PlannedNotification {
  id: string;
  at: Date;
  title: string;
  body: string;
  kind: 'task' | 'summary' | 'overdue' | 'market' | 'homework' | 'outing' | 'clothes';
}

const at = (date: ISODate, hhmm: string) => {
  const d = fromISO(date);
  const m = timeToMinutes(hhmm);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
};

export function planNotifications(
  h: Household, me: Member, instances: TaskInstance[], events: FamilyEvent[], now: Date, days = 7,
): PlannedNotification[] {
  const cfg = h.settings.notifications;
  if (!cfg.enabled) return [];
  const out: PlannedNotification[] = [];
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const mine = instances.filter((i) => !i.deleted && i.status === 'pending' && i.assignee_ids.includes(me.id) && i.kind !== 'mission');
  const clothes = (i: TaskInstance) => i.category === 'roupas' || i.category === 'lavanderia';

  for (let n = 0; n < days; n++) {
    const d = addDays(todayISO, n);
    if (!cfg.weekdays.includes(weekday(d))) continue;
    const dayTasks = mine.filter((i) => i.date === d);

    if (dayTasks.length) {
      const high = dayTasks.filter((i) => i.priority === 'high').length;
      out.push({
        id: `summary:${d}`, at: at(d, cfg.daily_summary_time), kind: 'summary',
        title: 'Bom dia! ☀️',
        body: `Hoje você tem ${dayTasks.length} tarefa${dayTasks.length > 1 ? 's' : ''}${high ? ` (${high} 🔴)` : ''}. Abra o Nossa Casa para ver.`,
      });
      out.push({
        id: `overdue:${d}`, at: at(d, cfg.overdue_time), kind: 'overdue',
        title: 'Ficou alguma coisa para trás?',
        body: 'Se alguma tarefa de hoje não deu, tudo bem: dá para adiar ou reorganizar a semana.',
      });
    }

    for (const i of dayTasks) {
      if (!i.due_time) continue;
      const isClothes = clothes(i);
      if (isClothes && !cfg.categories.clothes) continue;
      if (i.kind === 'market' && !cfg.categories.market) continue;
      if (i.kind === 'homework' && !cfg.categories.homework) continue;
      if (i.template_id && !cfg.categories.recurring && !isClothes && i.kind === 'chore') continue;
      const when = new Date(at(d, i.due_time).getTime() - cfg.lead_minutes * 60000);
      out.push({
        id: `task:${i.id}`, at: when,
        kind: i.kind === 'market' ? 'market' : i.kind === 'homework' ? 'homework' : isClothes ? 'clothes' : 'task',
        title: i.kind === 'market' ? '🛒 Hora do mercado' : i.kind === 'homework' ? '📚 Lição da Inaê' : isClothes ? `👕 ${i.title}` : `⏰ ${i.title}`,
        body: `Daqui a ${cfg.lead_minutes} min (${i.due_time}).`,
      });
    }

    if (cfg.categories.outing) {
      for (const e of events.filter((x) => !x.deleted && !x.done && x.date === d)) {
        out.push({
          id: `event:${e.id}`, at: at(d, e.time ? minus(e.time, 60) : '09:00'), kind: 'outing',
          title: e.type === 'outing' ? '❤️ Tempo em família' : `📅 ${e.title}`,
          body: e.type === 'outing' ? `${e.title}${e.time ? ` às ${e.time}` : ' hoje'}. Aproveitem!` : `Compromisso${e.time ? ` às ${e.time}` : ' hoje'}.`,
        });
      }
    }
  }
  // Lembrete de passeio: sábado de manhã, se ainda não há passeio no fim de semana.
  if (cfg.categories.outing) {
    for (let n = 0; n < days; n++) {
      const d = addDays(todayISO, n);
      if (weekday(d) !== 6) continue;
      const hasOuting = events.some((e) => !e.deleted && e.type === 'outing' && (e.date === d || e.date === addDays(d, 1)));
      if (!hasOuting) {
        out.push({
          id: `outing:${d}`, at: at(d, '09:30'), kind: 'outing',
          title: '❤️ Tempo em família',
          body: 'Que tal um passeio neste fim de semana? Parque, praça, cinema… vale até um piquenique na sala.',
        });
      }
    }
  }
  return out.filter((n) => n.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 60);
}

function minus(hhmm: string, min: number) {
  const m = Math.max(0, timeToMinutes(hhmm) - min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
