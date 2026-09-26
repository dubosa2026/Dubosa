// Regras de negócio: recorrência, divisão justa, cozinha, sono, cobertura,
// preferências, fim de semana leve, reorganização, aprendizado e crianças.
import { describe, expect, it } from 'vitest';
import { weekBalance } from '../src/domain/balance';
import { addDays, weekDates, weekStart, weekday } from '../src/domain/dates';
import { childProgress } from '../src/domain/gamification';
import { stableId } from '../src/domain/ids';
import { postponeSuggestions, relaxedRecurrence } from '../src/domain/insights';
import { planNotifications } from '../src/domain/notifyPlan';
import { canDo, isRoutine, planWeek } from '../src/domain/planner';
import { occurrencesInWeek } from '../src/domain/recurrence';
import { checkDayRules, propagateRules } from '../src/domain/rules';
import { seedHousehold, seedIds, seedMembers, seedTemplates } from '../src/domain/seed';
import type { TaskInstance, TaskTemplate } from '../src/domain/types';

const ids = seedIds('casa-teste');
const household = seedHousehold(ids, null);
const members = seedMembers(ids);
const templates = seedTemplates(ids);
const WEEKS = ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];

function generate(weeks = WEEKS) {
  let existing: TaskInstance[] = [];
  for (const week of weeks) {
    const r = planWeek({ week, fromDate: week, household, members, templates, existing, mode: 'generate', now: '2026-09-21T08:00:00Z' });
    existing = [...existing, ...r.changes.map((c) => c.instance)];
  }
  return existing;
}
const all = generate();
const byTitle = (title: string) => all.filter((i) => i.title === title);
const dayOf = (d: string) => all.filter((i) => i.date === d);

describe('recorrência', () => {
  const tpl = (r: TaskTemplate['recurrence']) => ({ recurrence: { start: '2026-01-05', ...r }, created_at: '2026-01-01' });
  it('diária, semanal, quinzenal, mensal e a cada X dias', () => {
    expect(occurrencesInWeek(tpl({ type: 'daily' }), '2026-09-21')).toHaveLength(7);
    expect(occurrencesInWeek(tpl({ type: 'weekly' }), '2026-09-21')).toHaveLength(1);
    const bi = WEEKS.map((w) => occurrencesInWeek(tpl({ type: 'biweekly' }), w).length);
    expect(bi.reduce((a, b) => a + b, 0)).toBe(2);
    const months = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((w) => occurrencesInWeek(tpl({ type: 'monthly' }), w).length);
    expect(months.reduce((a, b) => a + b, 0)).toBe(1);
    const x3 = WEEKS.flatMap((w) => occurrencesInWeek(tpl({ type: 'every_x_days', interval: 3 }), w));
    expect(x3.length).toBeGreaterThanOrEqual(9);
    const custom = occurrencesInWeek(tpl({ type: 'custom', weekdays: [1, 4] }), '2026-09-21');
    expect(custom.map((o) => weekday(o.nominal))).toEqual([1, 4]);
    expect(occurrencesInWeek(tpl({ type: 'once', date: '2026-09-23' }), '2026-09-21')).toHaveLength(1);
  });

  it('ids de ocorrência são determinísticos (mesma tarefa nos dois celulares)', () => {
    expect(stableId('a:b')).toBe(stableId('a:b'));
    expect(stableId('a:b')).not.toBe(stableId('a:c'));
    expect(stableId('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('dados iniciais', () => {
  it('cadastra Eduardo e Jussara como administradores e as duas crianças', () => {
    const adults = members.filter((m) => m.kind === 'adult');
    expect(adults.map((m) => [m.name, m.role])).toEqual([['Eduardo', 'admin'], ['Jussara', 'admin']]);
    expect(members.filter((m) => m.kind === 'child').map((m) => m.name)).toEqual(['Inaê', 'Ian']);
  });

  it('cadastra todas as tarefas pedidas', () => {
    const titles = templates.map((t) => t.title);
    for (const t of ['Lavar azulejos', 'Limpar geladeira por dentro', 'Remover mofo das paredes', 'Molhar plantas', 'Fazer mercado',
      'Lição de casa da Inaê', 'Cozinhar', 'Lavar louça', 'Guardar louça', 'Retirar lixo', 'Limpar sapatos sujos', 'Lavar cortina']) {
      expect(titles.some((x) => x.startsWith(t))).toBe(true);
    }
    expect(templates.filter((t) => t.kind === 'mission').length).toBe(16);
    expect(templates.length).toBeGreaterThan(100);
  });
});

describe('regra da cozinha e do sono', () => {
  it('quem cozinha lava a louça e limpa o fogão, todos os dias', () => {
    for (const cook of byTitle('Cozinhar')) {
      const day = dayOf(cook.date);
      const dishes = day.find((i) => i.rule_tag === 'dishes')!;
      const stove = day.find((i) => i.rule_tag === 'stove')!;
      expect(dishes.assignee_ids).toEqual(cook.assignee_ids);
      expect(stove.assignee_ids).toEqual(cook.assignee_ids);
      expect(dishes.group_id).toBe(cook.id);
    }
  });

  it('quem lava a louça não faz a rotina de sono naquele dia', () => {
    for (const d of new Set(all.map((i) => i.date))) {
      expect(checkDayRules(dayOf(d))).toEqual([]);
    }
  });

  it('em dia útil, quem está em casa no jantar cozinha e quem chega às 20h faz o sono', () => {
    const monday = dayOf('2026-09-21');
    expect(monday.find((i) => i.rule_tag === 'cook')!.assignee_ids).toEqual([ids.jussara]);
    expect(monday.find((i) => i.rule_tag === 'sleep_routine')!.assignee_ids).toEqual([ids.eduardo]);
  });

  it('trocar quem cozinha manualmente arrasta a louça e o fogão e passa o sono para o outro', () => {
    const day = dayOf('2026-09-26');
    const cook = day.find((i) => i.rule_tag === 'cook')!;
    const other = cook.assignee_ids[0] === ids.eduardo ? ids.jussara : ids.eduardo;
    const patches = propagateRules({ ...cook, assignee_ids: [other] }, day, members);
    const after = day.map((i) => ({ ...i, assignee_ids: i.id === cook.id ? [other] : patches.find((p) => p.id === i.id)?.assignee_ids ?? i.assignee_ids }));
    expect(checkDayRules(after)).toEqual([]);
  });
});

describe('divisão justa', () => {
  it('a carga semanal fica equilibrada em todas as semanas', () => {
    for (const w of WEEKS) {
      const b = weekBalance(all, members, household, w);
      expect(b.balanced).toBe(true);
      expect(b.title).toBe('Distribuição equilibrada');
      expect(b.members.every((m) => m.minutes > 0)).toBe(true);
    }
  });

  it('não trata "em casa" como "faz mais": nenhum dos dois passa de 60% da carga', () => {
    for (const w of WEEKS) {
      for (const m of weekBalance(all, members, household, w).members) expect(m.actualShare).toBeLessThan(0.6);
    }
  });

  it('respeita horários: Eduardo não recebe tarefa marcada para quando está no trabalho', () => {
    const edu = members.find((m) => m.id === ids.eduardo)!;
    for (const i of all.filter((x) => x.assignee_ids.includes(ids.eduardo) && x.kind !== 'coverage')) {
      const tpl = templates.find((t) => t.id === i.template_id);
      if (tpl && isRoutine(tpl) && tpl.due_time && !tpl.rule_tag) expect(canDo(edu, i.date, tpl)).toBe(true);
    }
    const hang = byTitle('Pendurar roupas').filter((i) => weekday(i.date) >= 1 && weekday(i.date) <= 5);
    expect(hang.every((i) => i.assignee_ids[0] === ids.jussara)).toBe(true);
  });

  it('preferências da Jussara pesam, mas não viram exclusividade', () => {
    const pref = new Set(['roupas', 'organizacao', 'plantas', 'sapatos']);
    const chores = all.filter((i) => i.kind === 'chore' && i.assignee_ids.length === 1);
    const prefTasks = chores.filter((i) => pref.has(i.category));
    const jusPref = prefTasks.filter((i) => i.assignee_ids[0] === ids.jussara).length;
    expect(jusPref / prefTasks.length).toBeGreaterThan(0.5);
    const jusOther = new Set(chores.filter((i) => i.assignee_ids[0] === ids.jussara && !pref.has(i.category)).map((i) => i.category));
    expect(jusOther.size).toBeGreaterThanOrEqual(4);
    expect(prefTasks.some((i) => i.assignee_ids[0] === ids.eduardo)).toBe(true);
  });

  it('quarta-feira não recebe tarefa pesada', () => {
    const wed = all.filter((i) => weekday(i.date) === 3 && i.kind === 'chore' && !i.rule_tag);
    for (const i of wed) {
      const tpl = templates.find((t) => t.id === i.template_id);
      if (tpl && !isRoutine(tpl)) expect(i.effort < 3 && i.minutes < 30).toBe(true);
    }
  });

  it('fim de semana não vira dia de faxina: tarefas extras respeitam o limite', () => {
    for (const w of WEEKS) {
      for (const d of weekDates(w).filter((x) => [0, 6].includes(weekday(x)))) {
        for (const m of [ids.eduardo, ids.jussara]) {
          const extra = all.filter((i) => i.date === d && i.assignee_ids.includes(m) && i.kind === 'chore' && i.priority !== 'high')
            .filter((i) => !isRoutine(templates.find((t) => t.id === i.template_id)));
          expect(extra.reduce((s, i) => s + i.minutes, 0)).toBeLessThanOrEqual(household.settings.weekend_max_minutes);
        }
      }
    }
  });

  it('dia útil não é sobrecarregado', () => {
    for (const w of WEEKS) {
      for (const d of weekDates(w)) {
        for (const m of [ids.eduardo, ids.jussara]) {
          const total = all.filter((i) => i.date === d && i.assignee_ids.includes(m) && i.kind !== 'coverage').reduce((s, i) => s + i.minutes, 0);
          expect(total).toBeLessThanOrEqual(330);
        }
      }
    }
  });
});

describe('cobertura das crianças', () => {
  it('tarefa longa no fim de semana gera cobertura simultânea para o outro adulto', () => {
    const cov = all.filter((i) => i.kind === 'coverage');
    expect(cov.length).toBeGreaterThan(0);
    for (const c of cov) {
      const pair = all.find((i) => i.id === c.group_id)!;
      expect(pair).toBeTruthy();
      expect(c.date).toBe(pair.date);
      expect(c.assignee_ids).not.toEqual(pair.assignee_ids);
      expect(c.category).toBe('cobertura');
    }
  });

  it('a cobertura não conta como segunda obrigação na carga', () => {
    const w = WEEKS[0];
    const b = weekBalance(all, members, household, w);
    const withoutCov = weekBalance(all.filter((i) => i.kind !== 'coverage'), members, household, w);
    expect(b.members.map((m) => Math.round(m.weighted))).toEqual(withoutCov.members.map((m) => Math.round(m.weighted)));
  });
});

describe('crianças, lição e mercado', () => {
  it('missões vão só para as crianças e nunca para adultos', () => {
    const missions = all.filter((i) => i.kind === 'mission');
    expect(missions.length).toBeGreaterThan(50);
    expect(missions.every((i) => i.assignee_ids.every((a) => a === ids.inae || a === ids.child2))).toBe(true);
    expect(all.filter((i) => i.kind !== 'mission').every((i) => !i.assignee_ids.includes(ids.inae))).toBe(true);
  });

  it('lição da Inaê no sábado e mercado uma vez por semana', () => {
    expect(byTitle('Lição de casa da Inaê').every((i) => weekday(i.date) === 6)).toBe(true);
    expect(byTitle('Lição de casa da Inaê')).toHaveLength(4);
    expect(byTitle('Fazer mercado')).toHaveLength(4);
  });

  it('pontos, conquistas e meta semanal', () => {
    const inae = members.find((m) => m.id === ids.inae)!;
    const done = all.filter((i) => i.assignee_ids.includes(ids.inae) && i.date <= '2026-09-24').map((i) => ({ ...i, status: 'done' as const }));
    const p = childProgress(inae, done, '2026-09-24', '2026-09-21', 40);
    expect(p.weekPoints).toBeGreaterThan(40);
    expect(p.goalReached).toBe(true);
    expect(p.streakDays).toBe(4);
    expect(p.achievements.find((a) => a.id === 'streak3')!.earned).toBe(true);
  });
});

describe('reorganizar a semana', () => {
  it('traz atrasadas para hoje em diante e não mexe no que foi travado ou concluído', () => {
    const week = '2026-09-21';
    const today = '2026-09-24';
    let inst = generate([week]);
    const locked = inst.find((i) => i.kind === 'chore' && i.date >= today && !i.rule_tag)!;
    const done = inst.find((i) => i.kind === 'chore' && i.date >= today && i.id !== locked.id && !i.rule_tag)!;
    inst = inst.map((i) => (i.id === locked.id ? { ...i, locked: true } : i.id === done.id ? { ...i, status: 'done' as const } : i));
    const r = planWeek({ week, fromDate: today, household, members, templates, existing: inst, mode: 'reorganize', now: 'n' });
    const changed = new Map(r.changes.map((c) => [c.instance.id, c.instance]));
    expect(changed.has(locked.id)).toBe(false);
    expect(changed.has(done.id)).toBe(false);
    const overdueFlex = inst.filter((i) => i.status === 'pending' && i.date < today && i.kind === 'chore' && !isRoutine(templates.find((t) => t.id === i.template_id)));
    expect(overdueFlex.length).toBeGreaterThan(0);
    for (const o of overdueFlex) {
      const moved = changed.get(o.id);
      if (moved) expect(moved.date >= today).toBe(true);
    }
    expect(overdueFlex.some((o) => changed.get(o.id))).toBe(true);
  });
});

describe('aprendizado com o uso', () => {
  it('sugere mudar tarefas adiadas com frequência, sem aplicar sozinho', () => {
    const tpl = templates.find((t) => t.title === 'Limpar geladeira por dentro')!;
    const inst = all.filter((i) => i.template_id === tpl.id).map((i) => ({ ...i, postponed_count: 2 }));
    const s = postponeSuggestions(templates, [...inst, ...inst.map((i) => ({ ...i, id: i.id + 'x' }))], [], '2026-10-20');
    expect(s.some((x) => x.template.id === tpl.id)).toBe(true);
    expect(s[0].message).toContain('adiada frequentemente');
    expect(relaxedRecurrence(tpl).type).toBe('every_x_days');
    expect(postponeSuggestions(templates, inst, [], '2026-10-20', [`postponed:${tpl.id}`]).length).toBe(0);
  });
});

describe('notificações', () => {
  it('agenda resumo do dia, horário das tarefas, mercado e lição', () => {
    const jus = members.find((m) => m.id === ids.jussara)!;
    const edu = members.find((m) => m.id === ids.eduardo)!;
    const now = new Date(2026, 8, 21, 6, 0);
    const nj = planNotifications(household, jus, all, [], now);
    const ne = planNotifications(household, edu, all, [], now);
    expect(nj.some((n) => n.kind === 'summary')).toBe(true);
    expect(nj.some((n) => n.kind === 'clothes')).toBe(true);
    expect([...nj, ...ne].some((n) => n.kind === 'market')).toBe(true);
    expect([...nj, ...ne].some((n) => n.kind === 'homework')).toBe(true);
    expect(nj.some((n) => n.kind === 'outing')).toBe(true);
    expect(nj.every((n) => n.at.getTime() > now.getTime())).toBe(true);
    const off = planNotifications({ ...household, settings: { ...household.settings, notifications: { ...household.settings.notifications, enabled: false } } }, jus, all, [], now);
    expect(off).toEqual([]);
  });
});

it('datas: semana começa na segunda', () => {
  expect(weekStart('2026-09-27')).toBe('2026-09-21');
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
});

it('cuidar das crianças não gera "cobertura" (a rotina de sono já é o cuidado)', () => {
  for (const c of all.filter((i) => i.kind === 'coverage')) {
    const pair = all.find((i) => i.id === c.group_id)!;
    expect(['criancas', 'escola']).not.toContain(pair.category);
  }
});

it('reorganizar um plano recém-feito quase não mexe em nada (sem mudanças à toa)', () => {
  const week = '2026-09-21';
  // Casa criada numa quinta-feira: o plano começa nesse dia, como no aplicativo.
  const inst = planWeek({ week, fromDate: '2026-09-24', household, members, templates, existing: [], mode: 'generate', now: 'n' }).changes.map((c) => c.instance);
  const r = planWeek({ week, fromDate: '2026-09-24', household, members, templates, existing: inst, mode: 'reorganize', now: 'n' });
  const moved = r.changes.filter((c) => c.before && c.instance.kind !== 'coverage');
  const pendingFuture = inst.filter((i) => i.date >= '2026-09-24' && i.kind !== 'mission' && i.kind !== 'coverage').length;
  expect(moved.length).toBeLessThan(pendingFuture * 0.15);
});

describe('código de conexão para o segundo celular', () => {
  it('leva servidor, chave e convite numa mensagem só (e sobrevive a ser colado inteiro)', async () => {
    const { decodeConnection, encodeConnection, shareMessage } = await import('../src/domain/connection');
    const info = { url: 'https://abcd1234.supabase.co', anonKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x_y-z', invite: 'ABCD2345' };
    expect(decodeConnection(encodeConnection(info))).toEqual(info);
    expect(decodeConnection(shareMessage(info))).toEqual(info);
    expect(decodeConnection(`nossacasa://conectar?d=${encodeConnection({ ...info, invite: null })}`)).toEqual({ ...info, invite: null });
    expect(decodeConnection('texto qualquer')).toBeNull();
    expect(decodeConnection(encodeConnection({ ...info, url: 'https://ção.example' }))!.url).toBe('https://ção.example');
  });
});

it('login por usuário (sem e-mail)', async () => {
  const { toLoginEmail, displayUser } = await import('../src/domain/login');
  expect(toLoginEmail('Eduardo')).toBe('eduardo@nossacasa.app');
  expect(toLoginEmail('  Jussara Dubosa ')).toBe('jussara.dubosa@nossacasa.app');
  expect(toLoginEmail('Inaê')).toBe('inae@nossacasa.app');
  expect(toLoginEmail('jus@gmail.com')).toBe('jus@gmail.com');
  expect(toLoginEmail('ab')).toBeNull();
  expect(displayUser('eduardo@nossacasa.app')).toBe('eduardo');
});

it('acha o convite na mensagem colada', async () => {
  const { extractInvite, shareMessage } = await import('../src/domain/connection');
  expect(extractInvite(shareMessage({ url: 'https://x.supabase.co', anonKey: 'k'.repeat(40), invite: 'QWER2345' }))).toBe('QWER2345');
  expect(extractInvite('o código é abcd2345 ok')).toBe('ABCD2345');
  expect(extractInvite('nada aqui')).toBeNull();
});

describe('horário de execução das tarefas', () => {
  it('toda tarefa do dia ganha horário, dentro de quando a pessoa está em casa e sem sobreposição', async () => {
    const { suggestTimes } = await import('../src/domain/timeline');
    const { timeToMinutes } = await import('../src/domain/dates');
    for (const d of ['2026-09-21', '2026-09-23', '2026-09-26']) {
      for (const m of members.filter((x) => x.kind === 'adult')) {
        const mine = dayOf(d).filter((i) => i.assignee_ids.includes(m.id) && i.kind !== 'coverage' && i.kind !== 'mission');
        const times = suggestTimes(m, d, mine);
        expect(mine.every((i) => times.has(i.id))).toBe(true);
        // Quem tem horário marcado mantém o horário.
        for (const i of mine.filter((x) => x.due_time)) expect(times.get(i.id)!.time).toBe(i.due_time);
        // Sugestões de Eduardo em dia útil ficam fora do horário de trabalho (07:00–20:00).
        if (m.id === ids.eduardo && d === '2026-09-21') {
          for (const i of mine.filter((x) => !x.due_time)) {
            const t = timeToMinutes(times.get(i.id)!.time);
            expect(t < 7 * 60 || t >= 20 * 60).toBe(true);
          }
        }
        // Sugestões não se sobrepõem.
        const spans = mine.filter((x) => !x.due_time).map((i) => [timeToMinutes(times.get(i.id)!.time), timeToMinutes(times.get(i.id)!.time) + Math.max(5, i.minutes)]).sort((a, b) => a[0] - b[0]);
        for (let k = 1; k < spans.length; k++) expect(spans[k][0]).toBeGreaterThanOrEqual(spans[k - 1][1]);
      }
    }
  });
});

it('atualização: acha o build mais novo publicado', async () => {
  const { newestBuild } = await import('../src/domain/release');
  const assets = [
    { name: 'NossaCasa.apk', browser_download_url: 'u0', size: 1 },
    { name: 'NossaCasa-build7.apk', browser_download_url: 'u7', size: 7 },
    { name: 'NossaCasa-build12.apk', browser_download_url: 'u12', size: 12 },
  ];
  expect(newestBuild(assets)).toEqual({ build: 12, url: 'u12', size: 12 });
  expect(newestBuild([])).toBeNull();
});
