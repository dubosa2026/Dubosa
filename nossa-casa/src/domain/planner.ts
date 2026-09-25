// Planejador de divisão justa.
//
// Não divide "50% das tarefas para cada um". Para cada tarefa ele considera:
//   - peso (esforço) e tempo estimado  -> carga ponderada;
//   - disponibilidade real de cada adulto naquele dia/turno (agenda);
//   - capacidade diária para tarefas extras, com reserva de descanso;
//   - dias leves (quarta-feira) e limite no fim de semana;
//   - preferências (ex.: Jussara prefere roupas/organização/plantas/sapatos) como PESO, não exclusividade;
//   - regras fixas: quem cozinha lava a louça e limpa o fogão; quem lava a louça
//     não faz a rotina de sono; cobertura das crianças durante tarefas longas;
//   - meta de divisão da carga doméstica total (inclui cuidado com as crianças).
// Se não couber tudo, prioriza (🔴 > 🟡 > 🟢) e adia o que for menos urgente.
import { EFFORT_INFO } from './categories';
import { addDays, isWeekend, timeToMinutes, weekDates, weekday } from './dates';
import { stableId } from './ids';
import { occurrencesInWeek, type Occurrence } from './recurrence';
import type {
  DaySchedule, Household, ISODate, Member, Slot, TaskInstance, TaskTemplate,
} from './types';

export interface PlanInput {
  week: ISODate; // segunda-feira
  /** Não planeja nada antes desta data (hoje). */
  fromDate: ISODate;
  household: Household;
  members: Member[];
  templates: TaskTemplate[];
  /** Instâncias já existentes (qualquer semana). */
  existing: TaskInstance[];
  /** 'generate' cria só o que falta; 'reorganize' também redistribui o que está pendente. */
  mode: 'generate' | 'reorganize';
  now: string;
  actorId?: string | null;
}

export interface PlanChange {
  instance: TaskInstance;
  before: { date: ISODate; assignee_ids: string[] } | null;
}

export interface PlanResult {
  changes: PlanChange[];
  deferred: { title: string; reason: string }[];
  warnings: string[];
  load: Record<string, number>;
}

const SLOT_RANGE: Record<Exclude<Slot, 'any'>, [number, number]> = {
  morning: [5 * 60, 12 * 60],
  afternoon: [12 * 60, 18 * 60],
  evening: [18 * 60, 24 * 60],
};

export const weight = (minutes: number, effort: 1 | 2 | 3) => minutes * EFFORT_INFO[effort].factor;

export function daySchedule(m: Member, date: ISODate): DaySchedule | null {
  return m.schedule?.[weekday(date)] ?? null;
}

export function isHomeDuring(m: Member, date: ISODate, slot: Slot): boolean {
  const s = daySchedule(m, date);
  if (!s) return false;
  if (slot === 'any') return s.home.length > 0;
  const [a, b] = SLOT_RANGE[slot];
  return s.home.some((blk) => timeToMinutes(blk.start) < b && timeToMinutes(blk.end) > a);
}

/** A pessoa está em casa no horário marcado da tarefa (ou no turno, se não houver horário)? */
export function canDo(m: Member, date: ISODate, t: { slot: Slot; due_time: string | null }): boolean {
  const s = daySchedule(m, date);
  if (!s) return false;
  if (t.due_time) {
    const x = timeToMinutes(t.due_time);
    return s.home.some((blk) => timeToMinutes(blk.start) <= x && timeToMinutes(blk.end) > x);
  }
  return isHomeDuring(m, date, t.slot);
}

/** Minutos de tarefas extras que cabem no dia, já descontando a reserva de descanso. */
export function dayCapacity(m: Member, date: ISODate, h: Household): number {
  const s = daySchedule(m, date);
  if (!s) return 0;
  let cap = s.capacity * (1 - h.settings.rest_reserve);
  if (isWeekend(date)) cap = Math.min(cap, h.settings.weekend_max_minutes);
  return Math.max(0, Math.round(cap));
}

/** Tarefa de rotina = regra fixa ou dia fixo. As demais são "extras" e consomem capacidade. */
export function isRoutine(t: Pick<TaskTemplate, 'rule_tag' | 'recurrence'> | undefined | null): boolean {
  if (!t) return false;
  if (t.rule_tag) return true;
  const r = t.recurrence;
  return r.type === 'daily' || r.type === 'custom' || (!!r.weekdays && r.weekdays.length > 0);
}

export function instanceKey(templateId: string, occurrence: string) {
  return `${templateId}|${occurrence}`;
}

export function instanceId(householdId: string, templateId: string, occurrence: string) {
  return stableId(`${householdId}:inst:${templateId}:${occurrence}`);
}

export function coverageId(choreId: string) {
  return stableId(`coverage:${choreId}`);
}

export function counts(i: TaskInstance) {
  return i.status !== 'cancelled' && i.status !== 'skipped' && !i.deleted;
}

/** Carga ponderada de uma instância para um adulto (cobertura usa o fator configurado). */
export function instanceLoad(i: TaskInstance, h: Household): number {
  if (i.kind === 'mission') return 0;
  const w = weight(i.minutes, i.effort);
  return i.kind === 'coverage' ? w * h.settings.coverage_load_factor : w;
}

interface Ctx {
  input: PlanInput;
  adults: Member[];
  share: Record<string, number>;
  load: Record<string, number>;
  dayTotal: Record<string, number>; // `${member}|${date}` -> minutos (tudo)
  dayExtra: Record<string, number>; // `${member}|${date}` -> minutos de extras
  tplById: Map<string, TaskTemplate>;
  out: Map<string, PlanChange>;
  /** Tudo o que foi posicionado nesta rodada, mudando ou não. */
  all: Map<string, TaskInstance>;
  deferred: PlanResult['deferred'];
  warnings: string[];
}

/** Quanto pesa o total do dia na escolha (espalha as tarefas e evita dias pesados). */
const DAY_WEIGHT = 0.9;

const dk = (m: string, d: ISODate) => `${m}|${d}`;

function addLoad(ctx: Ctx, i: TaskInstance, sign = 1) {
  if (!counts(i)) return;
  const tpl = i.template_id ? ctx.tplById.get(i.template_id) : undefined;
  const w = instanceLoad(i, ctx.input.household);
  const extra = i.kind === 'chore' && !isRoutine(tpl) && !i.rule_tag;
  for (const a of i.assignee_ids) {
    if (!(a in ctx.load)) continue;
    ctx.load[a] += sign * w;
    ctx.dayTotal[dk(a, i.date)] = (ctx.dayTotal[dk(a, i.date)] ?? 0) + sign * i.minutes;
    if (extra) ctx.dayExtra[dk(a, i.date)] = (ctx.dayExtra[dk(a, i.date)] ?? 0) + sign * i.minutes;
  }
}

function score(ctx: Ctx, m: Member, t: { minutes: number; effort: 1 | 2 | 3; category: string }, date: ISODate) {
  const w = weight(t.minutes, t.effort);
  const share = Math.max(0.05, ctx.share[m.id] ?? 0.5);
  const pref = (m.preferences as Record<string, number>)[t.category] ?? 0;
  return (ctx.load[m.id] + w) / (2 * share) - pref * 0.5 * w + dayPenalty(ctx, m, date, t.minutes);
}

/** Minutos a partir dos quais o dia fica pesado para a pessoa (tudo somado, rotina + extras). */
export function daySoftMax(m: Member, date: ISODate): number {
  if (isWeekend(date)) return 210;
  const s = daySchedule(m, date);
  const home = s ? s.home.reduce((acc, b) => acc + timeToMinutes(b.end) - timeToMinutes(b.start), 0) : 0;
  return Math.max(60, Math.round(home * 0.45));
}

function dayPenalty(ctx: Ctx, m: Member, date: ISODate, minutes: number) {
  const total = (ctx.dayTotal[dk(m.id, date)] ?? 0) + minutes;
  return DAY_WEIGHT * total + 2 * Math.max(0, total - daySoftMax(m, date));
}

/** Ao reorganizar, manter o que já estava combinado vale este "desconto" (evita mudanças à toa). */
const STICKY = 40;

const keeps = (prev: TaskInstance | undefined, ids: string[], date: ISODate) =>
  !!prev && prev.date === date && sameSet(prev.assignee_ids, ids);

function pickBalanced(ctx: Ctx, cands: Member[], t: { minutes: number; effort: 1 | 2 | 3; category: string }, date: ISODate, prev?: TaskInstance) {
  let best: Member | null = null;
  let bestScore = Infinity;
  for (const m of cands) {
    const s = score(ctx, m, t, date) - (keeps(prev, [m.id], date) ? STICKY : 0);
    if (s < bestScore - 1e-9) {
      best = m;
      bestScore = s;
    }
  }
  return best;
}

function makeInstance(ctx: Ctx, tpl: TaskTemplate, occ: Occurrence, date: ISODate, assignees: string[], prev?: TaskInstance): TaskInstance {
  const { household, now, actorId } = ctx.input;
  const base: TaskInstance = prev ?? {
    id: instanceId(household.id, tpl.id, occ.key),
    household_id: household.id,
    template_id: tpl.id,
    occurrence: occ.key,
    title: tpl.title,
    category: tpl.category,
    kind: tpl.kind,
    date,
    due_time: tpl.due_time,
    slot: tpl.slot,
    minutes: tpl.minutes,
    effort: tpl.effort,
    priority: tpl.priority,
    assignee_ids: assignees,
    status: 'pending',
    completed_by: [],
    completed_at: null,
    group_id: null,
    rule_tag: tpl.rule_tag,
    locked: false,
    postponed_count: 0,
    points: tpl.points,
    actual_seconds: 0,
    timer_started_at: null,
    notes: tpl.notes,
    created_by: actorId ?? null,
    updated_by: actorId ?? null,
    created_at: now,
    updated_at: now,
    deleted: false,
  };
  return { ...base, date, assignee_ids: assignees, updated_at: now, updated_by: actorId ?? base.updated_by };
}

function record(ctx: Ctx, inst: TaskInstance, prev: TaskInstance | undefined) {
  ctx.all.set(inst.id, inst);
  if (prev && prev.date === inst.date && sameSet(prev.assignee_ids, inst.assignee_ids) && prev.group_id === inst.group_id) return;
  const existing = ctx.out.get(inst.id);
  ctx.out.set(inst.id, {
    instance: inst,
    before: existing ? existing.before : prev ? { date: prev.date, assignee_ids: prev.assignee_ids } : null,
  });
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

interface Item {
  tpl: TaskTemplate;
  occ: Occurrence;
  prev?: TaskInstance;
  window: ISODate[];
}

export function planWeek(input: PlanInput): PlanResult {
  const { household, members, templates, existing, week, fromDate, mode } = input;
  const adults = members.filter((m) => m.kind === 'adult' && !m.deleted).sort((a, b) => a.sort - b.sort);
  const days = weekDates(week);
  const weekEnd = days[6];
  const shareRaw = household.settings.target_share;
  const shareSum = adults.reduce((s, a) => s + (shareRaw[a.id] ?? 1 / adults.length), 0) || 1;
  const ctx: Ctx = {
    input,
    adults,
    share: Object.fromEntries(adults.map((a) => [a.id, (shareRaw[a.id] ?? 1 / adults.length) / shareSum])),
    load: Object.fromEntries(adults.map((a) => [a.id, 0])),
    dayTotal: {},
    dayExtra: {},
    tplById: new Map(templates.map((t) => [t.id, t])),
    out: new Map(),
    all: new Map(),
    deferred: [],
    warnings: [],
  };
  if (!adults.length) return { changes: [], deferred: [], warnings: ['Nenhum adulto cadastrado.'], load: {} };

  const activeTemplates = templates.filter((t) => t.active && !t.deleted);
  const byKey = new Map<string, TaskInstance>();
  for (const i of existing) if (i.template_id && i.occurrence && !i.deleted) byKey.set(instanceKey(i.template_id, i.occurrence), i);

  const planDays = days.filter((d) => d >= fromDate);
  const inWeek = existing.filter((i) => !i.deleted && i.date >= week && i.date <= weekEnd);

  // 1) O que será (re)posicionado agora.
  const movable = (i: TaskInstance) =>
    mode === 'reorganize' && i.status === 'pending' && !i.locked && i.kind !== 'mission' && i.kind !== 'coverage' && i.date >= fromDate;
  const overdue = mode === 'reorganize'
    ? existing.filter((i) => !i.deleted && i.status === 'pending' && i.date < fromDate && !i.locked && i.kind !== 'mission' && i.kind !== 'coverage' && i.date >= addDays(fromDate, -21))
    : [];
  const replacing = new Set([...inWeek.filter(movable), ...overdue].map((i) => i.id));

  // Carga já comprometida (concluídas, travadas, missões, dias passados).
  for (const i of inWeek) if (!replacing.has(i.id) && i.kind !== 'coverage') addLoad(ctx, i);
  for (const i of inWeek) if (!replacing.has(i.id) && i.kind === 'coverage' && !replacing.has(i.group_id ?? '')) addLoad(ctx, i);

  const items: Item[] = [];
  const seenTpl = new Set<string>();
  for (const tpl of activeTemplates) {
    for (const occ of occurrencesInWeek(tpl, week)) {
      const prev = byKey.get(instanceKey(tpl.id, occ.key));
      if (prev && !replacing.has(prev.id)) continue; // já existe e não será mexida
      if (!prev && mode === 'reorganize' && occ.window.every((d) => d < fromDate)) continue;
      const window = occ.window.filter((d) => d >= fromDate);
      if (!window.length) continue;
      items.push({ tpl, occ, prev, window });
      seenTpl.add(`${tpl.id}|${occ.key}`);
    }
  }
  // Tarefas espaçadas (quinzenal/mensal) que não couberam na semana anterior voltam uma vez.
  if (mode === 'generate' && planDays.length) {
    const prevWeek = addDays(week, -7);
    const prevPlanned = existing.some((i) => !i.deleted && i.template_id && i.date >= prevWeek && i.date < week);
    if (prevPlanned) {
      for (const tpl of activeTemplates) {
        const r = tpl.recurrence;
        const spaced = r.type === 'biweekly' || r.type === 'monthly' || (r.type === 'every_x_days' && (r.interval ?? 1) >= 14);
        if (!spaced || isRoutine(tpl) || tpl.kind === 'mission') continue;
        for (const occ of occurrencesInWeek(tpl, prevWeek)) {
          if (byKey.has(instanceKey(tpl.id, occ.key))) continue;
          items.push({ tpl, occ: { ...occ, fixed: false, nominal: planDays[0], window: planDays }, window: planDays });
          seenTpl.add(`${tpl.id}|${occ.key}`);
        }
      }
    }
  }
  // Atrasadas: voltam para a semana a partir de hoje.
  for (const i of overdue) {
    const tpl = i.template_id ? ctx.tplById.get(i.template_id) : undefined;
    if (!tpl || seenTpl.has(`${tpl.id}|${i.occurrence}`)) continue;
    if (isRoutine(tpl) && tpl.recurrence.type === 'daily') {
      // Rotina diária atrasada não se acumula: a do dia seguinte substitui.
      continue;
    }
    items.push({ tpl, occ: { key: i.occurrence ?? 'x', nominal: fromDate, window: planDays, fixed: false }, prev: i, window: planDays });
  }
  // Tarefas avulsas (sem modelo) pendentes também podem ser redistribuídas.
  const looseToMove = [...inWeek, ...overdue].filter((i) => replacing.has(i.id) && !i.template_id);

  // Missões (crianças): sempre para a criança indicada, sem cálculo de carga.
  for (const it of items.filter((x) => x.tpl.kind === 'mission')) {
    const inst = makeInstance(ctx, it.tpl, it.occ, it.window[0], it.tpl.assignee_ids, it.prev);
    record(ctx, inst, it.prev);
  }

  const adultItems = items.filter((x) => x.tpl.kind !== 'mission');
  const eligible = (tpl: TaskTemplate): Member[] => {
    if (tpl.assign_mode === 'fixed' && tpl.assignee_ids.length) {
      return adults.filter((a) => tpl.assignee_ids.includes(a.id));
    }
    return adults;
  };

  // 2) Regras por dia: café/escola, cozinhar (+louça +fogão), rotina de sono.
  const byRule = (rule: string) => adultItems.filter((x) => x.tpl.rule_tag === rule);
  const takeOn = (rule: string, d: ISODate) => byRule(rule).find((x) => x.window.includes(d) && x.occ.fixed);
  const findExisting = (rule: string, d: ISODate) =>
    inWeek.find((i) => i.rule_tag === rule && i.date === d && !replacing.has(i.id) && counts(i));
  const placed = new Set<Item>();
  const placeFixed = (it: Item, d: ISODate, who: string[], group: string | null = null) => {
    const inst = makeInstance(ctx, it.tpl, it.occ, d, who, it.prev);
    inst.group_id = group;
    record(ctx, inst, it.prev);
    addLoad(ctx, inst);
    placed.add(it);
    return inst;
  };

  for (const d of planDays) {
    const mk = takeOn('morning_kids', d);
    if (mk) {
      const cands = eligible(mk.tpl).filter((a) => daySchedule(a, d)?.morning_kids);
      const who = pickBalanced(ctx, cands.length ? cands : eligible(mk.tpl), mk.tpl, d, mk.prev);
      if (who) placeFixed(mk, d, [who.id]);
    }

    const cook = takeOn('cook', d);
    const dishes = takeOn('dishes', d);
    const stove = takeOn('stove', d);
    const sleep = takeOn('sleep_routine', d);
    let cookId: string | null = findExisting('cook', d)?.assignee_ids[0] ?? null;
    let cookInst: TaskInstance | null = findExisting('cook', d) ?? null;
    if (cook) {
      const cands = eligible(cook.tpl).filter((a) => daySchedule(a, d)?.dinner);
      const pool = cands.length ? cands : eligible(cook.tpl);
      // Escolhe quem cozinha olhando o pacote todo (cozinhar+louça+fogão) contra a rotina de sono do outro.
      const bundle = weight(cook.tpl.minutes, cook.tpl.effort) + (dishes ? weight(dishes.tpl.minutes, dishes.tpl.effort) : 0) + (stove ? weight(stove.tpl.minutes, stove.tpl.effort) : 0);
      const sleepW = sleep ? weight(sleep.tpl.minutes, sleep.tpl.effort) : 0;
      let best: Member | null = null;
      let bestImb = Infinity;
      for (const c of pool) {
        const others = adults.filter((a) => a.id !== c.id);
        const L = { ...ctx.load };
        L[c.id] += bundle;
        if (others[0]) L[others[0].id] += sleepW;
        const norm = adults.map((a) => L[a.id] / Math.max(0.05, ctx.share[a.id]));
        const cookMin = cook.tpl.minutes + (dishes?.tpl.minutes ?? 0) + (stove?.tpl.minutes ?? 0);
        const imb = Math.max(...norm) - Math.min(...norm)
          + dayPenalty(ctx, c, d, cookMin) + (others[0] && sleep ? dayPenalty(ctx, others[0], d, sleep.tpl.minutes) : 0)
          - (keeps(cook.prev, [c.id], d) ? STICKY : 0);
        if (imb < bestImb - 1e-9) {
          best = c;
          bestImb = imb;
        }
      }
      if (best) {
        cookInst = placeFixed(cook, d, [best.id]);
        cookId = best.id;
      }
    }
    // Quem cozinha lava a louça e limpa o fogão.
    const group = cookInst?.id ?? null;
    if (dishes) {
      const who = cookId ?? pickBalanced(ctx, eligible(dishes.tpl), dishes.tpl, d)?.id;
      if (who) placeFixed(dishes, d, [who], group);
    }
    if (stove) {
      const who = cookId ?? pickBalanced(ctx, eligible(stove.tpl), stove.tpl, d)?.id;
      if (who) placeFixed(stove, d, [who], group);
    }
    // Quem lava a louça não faz a rotina de sono.
    if (sleep) {
      const dishesInst = [...ctx.out.values()].map((c) => c.instance).find((i) => i.rule_tag === 'dishes' && i.date === d)
        ?? findExisting('dishes', d);
      const washer = dishesInst?.assignee_ids[0] ?? cookId;
      let cands = eligible(sleep.tpl).filter((a) => a.id !== washer);
      const home = cands.filter((a) => daySchedule(a, d)?.evening);
      if (home.length) cands = home;
      else if (cands.length) ctx.warnings.push(`${fmt(d)}: quem não lava a louça não está em casa à noite — confira a rotina de sono.`);
      if (!cands.length) cands = eligible(sleep.tpl);
      const who = pickBalanced(ctx, cands, sleep.tpl, d, sleep.prev);
      if (who) placeFixed(sleep, d, [who.id]);
    }
  }

  // 3) Demais tarefas de rotina (dia fixo), por prioridade.
  const prioOrder = { high: 0, medium: 1, low: 2 } as const;
  const sortItems = (a: Item, b: Item) =>
    prioOrder[a.tpl.priority] - prioOrder[b.tpl.priority] || b.tpl.effort - a.tpl.effort || b.tpl.minutes - a.tpl.minutes;
  const routine = adultItems.filter((x) => !placed.has(x) && x.occ.fixed && !x.tpl.rule_tag?.match(/^(cook|dishes|stove|sleep_routine|morning_kids)$/)).sort(sortItems);
  for (const it of routine) {
    const d = it.window[0];
    if (it.tpl.assign_mode === 'shared') {
      placeFixed(it, d, adults.map((a) => a.id));
      continue;
    }
    const pool = eligible(it.tpl);
    const home = pool.filter((a) => canDo(a, d, it.tpl));
    const who = pickBalanced(ctx, home.length ? home : pool, it.tpl, d, it.prev);
    if (who) placeFixed(it, d, [who.id]);
  }
  // Rotinas com regra que ficaram de fora (ex.: regra sem ocorrência fixa).
  for (const it of adultItems.filter((x) => !placed.has(x) && x.occ.fixed && x.tpl.rule_tag)) {
    const d = it.window[0];
    const who = pickBalanced(ctx, eligible(it.tpl), it.tpl, d, it.prev);
    if (who) placeFixed(it, d, [who.id]);
  }

  // 4) Tarefas flexíveis (semanal/quinzenal/mensal/a cada X dias): melhor pessoa + melhor dia.
  const flex = adultItems.filter((x) => !placed.has(x)).sort(sortItems);
  const lightDays = new Set(household.settings.light_days);
  const heavy = (t: { effort: number; minutes: number }) => t.effort >= 3 || t.minutes >= 30;
  const placeFlex = (tpl: TaskTemplate | null, loose: TaskInstance | null, it: Item | null) => {
    const t = tpl ?? (loose as TaskInstance);
    const minutes = t.minutes;
    const window = it ? it.window : planDays;
    const shared = tpl ? tpl.assign_mode === 'shared' : (loose?.assignee_ids.length ?? 0) > 1;
    const pool = tpl ? eligible(tpl) : adults;
    type Opt = { who: Member[]; d: ISODate; s: number; over: number };
    const opts: Opt[] = [];
    for (const d of window) {
      if (lightDays.has(weekday(d)) && heavy(t)) continue;
      const groups: Member[][] = shared ? [pool] : pool.map((m) => [m]);
      for (const g of groups) {
        const slotOk = g.every((m) => canDo(m, d, t));
        if (!slotOk) continue;
        const over = Math.max(...g.map((m) => (ctx.dayExtra[dk(m.id, d)] ?? 0) + minutes - dayCapacity(m, d, household)));
        const nominalDist = it ? Math.abs(daysBetween(d, it.occ.nominal)) : 0;
        const s = g.reduce((acc, m) => acc + score(ctx, m, t, d), 0) / g.length
          + (isWeekend(d) ? 25 : 0) + nominalDist * 2
          - (keeps(it?.prev ?? loose ?? undefined, g.map((m) => m.id), d) ? STICKY : 0);
        opts.push({ who: g, d, s, over });
      }
    }
    const fits = opts.filter((o) => o.over <= 0).sort((a, b) => a.s - b.s);
    let choice: Opt | undefined = fits[0];
    if (!choice && t.priority === 'high') {
      choice = opts.sort((a, b) => a.over - b.over || a.s - b.s)[0];
      if (choice) ctx.warnings.push(`"${t.title}" é prioritária e foi encaixada mesmo com o dia cheio (${fmt(choice.d)}).`);
    }
    if (!choice) {
      ctx.deferred.push({ title: t.title, reason: t.priority === 'low' ? 'baixa prioridade — fica para outra semana' : 'sem espaço na agenda desta semana' });
      return;
    }
    const ids = choice.who.map((m) => m.id);
    if (tpl && it) {
      placeFixed(it, choice.d, ids);
    } else if (loose) {
      const inst = { ...loose, date: choice.d, assignee_ids: ids, updated_at: input.now, updated_by: input.actorId ?? loose.updated_by };
      record(ctx, inst, loose);
      addLoad(ctx, inst);
    }
  };
  for (const it of flex) placeFlex(it.tpl, null, it);
  for (const i of looseToMove) placeFlex(null, i, null);

  // 5) Cobertura das crianças: tarefas longas no fim de semana ou à noite -> o outro adulto fica com as crianças.
  const planned = [...ctx.all.values()];
  const minCov = household.settings.coverage_min_minutes;
  const existingById = new Map(existing.map((i) => [i.id, i]));
  for (const i of planned) {
    if (i.kind !== 'chore' || i.minutes < minCov || i.assignee_ids.length !== 1 || !counts(i)) continue;
    if (i.rule_tag === 'cook' || i.rule_tag === 'dishes' || i.rule_tag === 'stove') continue;
    // Cuidar das crianças (rotina de sono, café, lição) já é o cuidado — não gera cobertura.
    if (i.rule_tag === 'sleep_routine' || i.rule_tag === 'morning_kids' || i.category === 'criancas' || i.category === 'escola') continue;
    const kidsHome = isWeekend(i.date) || i.slot === 'evening';
    if (!kidsHome) continue;
    const doer = adults.find((a) => a.id === i.assignee_ids[0]);
    const other = adults.find((a) => a.id !== i.assignee_ids[0] && isHomeDuring(a, i.date, i.slot === 'any' ? 'any' : i.slot));
    if (!doer || !other) continue;
    const id = coverageId(i.id);
    const prev = existingById.get(id);
    const cov: TaskInstance = {
      ...(prev ?? i),
      id,
      template_id: null,
      occurrence: null,
      title: `Cobertura das crianças — enquanto ${doer.name} faz: ${i.title}`,
      category: 'cobertura',
      kind: 'coverage',
      date: i.date,
      due_time: i.due_time,
      slot: i.slot,
      minutes: i.minutes,
      effort: 1,
      priority: i.priority,
      assignee_ids: [other.id],
      status: prev?.status ?? 'pending',
      completed_by: prev?.completed_by ?? [],
      completed_at: prev?.completed_at ?? null,
      group_id: i.id,
      rule_tag: null,
      locked: false,
      postponed_count: 0,
      points: 0,
      actual_seconds: prev?.actual_seconds ?? 0,
      timer_started_at: null,
      notes: 'Tarefa simultânea: faz parte da mesma janela de organização familiar.',
      created_at: prev?.created_at ?? input.now,
      updated_at: input.now,
      deleted: false,
    };
    record(ctx, cov, prev);
    addLoad(ctx, cov);
  }
  // Coberturas antigas cujo par mudou de pessoa/dia ou deixou de existir.
  for (const i of inWeek.filter((x) => x.kind === 'coverage' && x.status === 'pending' && replacing.has(x.group_id ?? ''))) {
    if (ctx.all.has(i.id)) continue;
    ctx.out.set(i.id, {
      instance: { ...i, status: 'cancelled', updated_at: input.now, updated_by: input.actorId ?? i.updated_by },
      before: { date: i.date, assignee_ids: i.assignee_ids },
    });
  }

  return { changes: [...ctx.out.values()], deferred: ctx.deferred, warnings: ctx.warnings, load: ctx.load };
}

function daysBetween(a: ISODate, b: ISODate) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}

function fmt(d: ISODate) {
  return d.split('-').reverse().slice(0, 2).join('/');
}
