// Regras aplicadas quando alguém muda um responsável manualmente.
//   - Quem cozinha lava a louça e limpa o fogão (as três andam juntas).
//   - Quem lava a louça não faz a rotina de sono das crianças naquele dia.
import type { Member, TaskInstance } from './types';

export interface RulePatch {
  id: string;
  assignee_ids: string[];
  reason: string;
}

const active = (i: TaskInstance) => !i.deleted && i.status !== 'cancelled';

/**
 * Dado que `changed` recebeu novos responsáveis, devolve os ajustes que as
 * regras exigem nas outras tarefas do mesmo dia.
 */
export function propagateRules(changed: TaskInstance, dayInstances: TaskInstance[], adults: Member[]): RulePatch[] {
  const patches: RulePatch[] = [];
  const same = dayInstances.filter((i) => i.date === changed.date && i.id !== changed.id && active(i));
  const who = changed.assignee_ids[0];
  if (!who) return patches;

  const kitchenTags = ['cook', 'dishes', 'stove'];
  if (changed.rule_tag && kitchenTags.includes(changed.rule_tag)) {
    for (const i of same) {
      if (i.rule_tag && kitchenTags.includes(i.rule_tag) && (i.assignee_ids[0] !== who || i.assignee_ids.length !== 1)) {
        patches.push({ id: i.id, assignee_ids: [who], reason: 'Quem cozinha lava a louça e limpa o fogão.' });
      }
    }
    const sleep = same.find((i) => i.rule_tag === 'sleep_routine');
    if (sleep && sleep.assignee_ids.includes(who)) {
      const other = adults.find((a) => a.id !== who && a.kind === 'adult' && !a.deleted);
      if (other) patches.push({ id: sleep.id, assignee_ids: [other.id], reason: 'Quem lava a louça não faz a rotina de sono.' });
    }
  }

  if (changed.rule_tag === 'sleep_routine') {
    const dishes = same.find((i) => i.rule_tag === 'dishes');
    if (dishes && dishes.assignee_ids.includes(who)) {
      // Mantém a escolha do usuário para o sono e passa o pacote da cozinha para o outro adulto.
      const other = adults.find((a) => a.id !== who && a.kind === 'adult' && !a.deleted);
      if (other) {
        for (const i of same) {
          if (i.rule_tag === 'cook' || i.rule_tag === 'dishes' || i.rule_tag === 'stove') {
            patches.push({ id: i.id, assignee_ids: [other.id], reason: 'Quem faz a rotina de sono não lava a louça — a cozinha passa para o outro.' });
          }
        }
      }
    }
  }
  return patches;
}

/** Verifica as regras num conjunto de tarefas de um dia. Retorna mensagens de conflito (vazio = ok). */
export function checkDayRules(dayInstances: TaskInstance[]): string[] {
  const act = dayInstances.filter(active);
  const problems: string[] = [];
  const cook = act.find((i) => i.rule_tag === 'cook');
  const dishes = act.find((i) => i.rule_tag === 'dishes');
  const stove = act.find((i) => i.rule_tag === 'stove');
  const sleep = act.find((i) => i.rule_tag === 'sleep_routine');
  if (cook && dishes && cook.assignee_ids[0] !== dishes.assignee_ids[0]) problems.push('Quem cozinha deveria lavar a louça.');
  if (cook && stove && cook.assignee_ids[0] !== stove.assignee_ids[0]) problems.push('Quem cozinha deveria limpar o fogão.');
  if (dishes && sleep && sleep.assignee_ids.some((a) => dishes.assignee_ids.includes(a))) {
    problems.push('Quem lava a louça não deveria fazer a rotina de sono.');
  }
  return problems;
}
