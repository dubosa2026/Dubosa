// "Nossa Casa IA" — modo local. Responde às perguntas mais comuns lendo os
// dados reais do aparelho (funciona offline e sem chave de IA). Quando a IA
// na nuvem está ativada, perguntas livres vão para a função `assistant` do
// Supabase (Claude), que também consulta o banco de verdade.
import { weekBalance } from './balance';
import { category } from './categories';
import { addDays, formatMinutes, formatShort, weekStart } from './dates';
import type { Snapshot, TaskInstance } from './types';

export interface AssistantAnswer {
  text: string;
  action?: 'reorganize' | 'shopping';
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function answerLocally(question: string, snap: Snapshot, today: string): AssistantAnswer {
  const q = norm(question);
  const h = snap.household;
  if (!h) return { text: 'Ainda não há uma casa configurada.' };
  const adults = snap.members.filter((m) => m.kind === 'adult' && !m.deleted).sort((a, b) => a.sort - b.sort);
  const kids = snap.members.filter((m) => m.kind === 'child' && !m.deleted);
  const name = (id: string) => snap.members.find((m) => m.id === id)?.name ?? '?';
  const live = snap.instances.filter((i) => !i.deleted && i.status !== 'cancelled');
  const line = (i: TaskInstance) =>
    `${i.status === 'done' ? '☑' : '☐'} ${category(i.category).emoji} ${i.title}${i.due_time ? ` (${i.due_time})` : ''}`;
  const dayReport = (d: string, label: string) => {
    const parts: string[] = [];
    for (const a of adults) {
      const list = live.filter((i) => i.date === d && i.assignee_ids.includes(a.id) && i.kind !== 'mission');
      parts.push(`${a.emoji} ${a.name}${list.length ? '' : ': nada programado'}\n${list.map(line).join('\n')}`.trim());
    }
    const missions = live.filter((i) => i.date === d && i.kind === 'mission');
    if (missions.length) {
      for (const k of kids) {
        const m = missions.filter((i) => i.assignee_ids.includes(k.id));
        if (m.length) parts.push(`${k.emoji} ${k.name}: ${m.filter((i) => i.status === 'done').length}/${m.length} missões`);
      }
    }
    const ev = snap.events.filter((e) => !e.deleted && e.date === d);
    if (ev.length) parts.push(`❤️ ${ev.map((e) => e.title).join(', ')}`);
    return `${label}:\n\n${parts.join('\n\n')}`;
  };

  if (/organiz|redistribu|reorganiz/.test(q) && /semana/.test(q)) {
    return { text: 'Vou calcular uma nova distribuição para o resto da semana. Você confirma antes de aplicar.', action: 'reorganize' };
  }
  if (/atrasad|pendent.*ontem|ficou para tras/.test(q)) {
    const late = live.filter((i) => i.status === 'pending' && i.date < today && i.kind !== 'mission' && i.kind !== 'coverage');
    if (!late.length) return { text: 'Nada atrasado. 🎉' };
    const by = adults.map((a) => {
      const l = late.filter((i) => i.assignee_ids.includes(a.id));
      return l.length ? `${a.name}:\n${l.slice(0, 12).map((i) => `☐ ${i.title} (${formatShort(i.date)})`).join('\n')}` : '';
    }).filter(Boolean);
    return { text: `Tarefas atrasadas (${late.length}):\n\n${by.join('\n\n')}\n\nDica: "Reorganizar minha semana" redistribui tudo sem sobrecarregar ninguém.` };
  }
  if (/amanha/.test(q)) return { text: dayReport(addDays(today, 1), 'Amanhã') };
  if (/distribu|equilibr|divisao|carga/.test(q)) {
    const b = weekBalance(snap.instances, snap.members, h, weekStart(today));
    const rows = b.members.map((m) => `${m.member.name}: ${formatMinutes(m.minutes)} de tarefas${m.coverage ? ` (+ ${formatMinutes(m.coverage)} cobrindo as crianças)` : ''}`);
    return { text: `Equilíbrio da semana\n\n${rows.join('\n')}\n\n${b.title}. ${b.message}` };
  }
  if (/roupa|lavanderia|lavar roupa/.test(q)) {
    const d = /amanha/.test(q) ? addDays(today, 1) : today;
    const list = live.filter((i) => i.date === d && (i.category === 'roupas' || i.category === 'lavanderia'));
    if (!list.length) return { text: 'Hoje não há tarefas de roupa. 👕' };
    return { text: `Tarefas de roupa hoje:\n${list.map((i) => `${line(i)} — ${i.assignee_ids.map(name).join(' + ')}`).join('\n')}` };
  }
  if (/compr|mercado|lista/.test(q)) {
    const items = snap.shopping.filter((s) => !s.deleted && !s.bought);
    if (!items.length) return { text: 'A lista de compras está vazia. 🛒', action: 'shopping' };
    return { text: `Precisamos comprar (${items.length}):\n${items.map((s) => `☐ ${s.name}${s.quantity ? ` — ${s.quantity}` : ''}`).join('\n')}`, action: 'shopping' };
  }
  if (/pesad|faxina|limpeza pesada/.test(q)) {
    const heavy = live.filter((i) => i.status === 'pending' && i.effort === 3 && i.date >= addDays(today, -21) && i.date <= addDays(today, 14));
    if (!heavy.length) return { text: 'Nenhuma limpeza pesada pendente.' };
    return { text: `Limpezas pesadas pendentes:\n${heavy.map((i) => `☐ ${i.title} — ${formatShort(i.date)} (${i.assignee_ids.map(name).join(' + ')})`).join('\n')}` };
  }
  if (/licao|dever|escola/.test(q)) {
    const hw = snap.homework.filter((x) => !x.deleted && !x.done);
    if (!hw.length) return { text: 'Nenhuma lição pendente registrada. 📚' };
    return { text: `Lições pendentes:\n${hw.map((x) => `☐ ${x.activity}${x.subject ? ` (${x.subject})` : ''}${x.due_date ? ` — até ${formatShort(x.due_date)}` : ''}`).join('\n')}` };
  }
  if (/passeio|familia|fim de semana/.test(q)) {
    const ev = snap.events.filter((e) => !e.deleted && e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    if (!ev.length) return { text: 'Nenhum passeio marcado ainda. Que tal um parque ou uma praça neste fim de semana? ❤️' };
    return { text: `Próximos momentos em família:\n${ev.map((e) => `❤️ ${e.title} — ${formatShort(e.date)}${e.time ? ` ${e.time}` : ''}`).join('\n')}` };
  }
  if (/hoje|quem|fazer|o que/.test(q)) return { text: dayReport(today, 'Hoje') };
  return {
    text:
      'Posso responder, por exemplo:\n• Quem precisa fazer o quê hoje?\n• O que está atrasado?\n• Quais tarefas temos amanhã?\n• Como está a distribuição desta semana?\n• Temos alguma tarefa de roupa hoje?\n• O que precisamos comprar?\n• Organize minha semana.\n• Quais tarefas de limpeza pesada estão pendentes?',
  };
}
