// Dados iniciais da família: adultos, crianças, agenda, preferências e todas as
// tarefas pedidas. Tudo isto vai para o banco na criação da casa e depois pode
// ser alterado no próprio aplicativo (nada fica "preso" ao código).
import { addDays as addDaysISO } from './dates';
import { stableId } from './ids';
import type {
  AssignMode, CategoryId, DaySchedule, Effort, Household, HouseholdSettings, Member, Priority,
  Recurrence, RuleTag, Slot, TaskKind, TaskTemplate, Weekday,
} from './types';

export const SEED_EPOCH = '2026-01-01T00:00:00.000Z';

const block = (label: string, start: string, end: string) => ({ label, start, end });

/** Agenda padrão do Eduardo: sai 07:00, volta ~20:00; quarta fora o dia todo; fim de semana livre. */
export function eduardoSchedule(): DaySchedule[] {
  const workday: DaySchedule = {
    home: [block('Antes do trabalho', '06:00', '07:00'), block('Noite', '20:00', '23:00')],
    capacity: 35, dinner: false, morning_kids: false, evening: true,
  };
  const wednesday: DaySchedule = { ...workday, capacity: 10 };
  const saturday: DaySchedule = {
    home: [block('Dia todo', '07:30', '23:00')], capacity: 110, dinner: true, morning_kids: true, evening: true,
  };
  const sunday: DaySchedule = { ...saturday, capacity: 70 };
  return [sunday, workday, workday, wednesday, workday, workday, saturday];
}

/** Agenda padrão da Jussara: em casa seg/ter/qui/sex até 10:45 (com café e escola das crianças), volta 18:30 com as crianças. */
export function jussaraSchedule(): DaySchedule[] {
  const workday: DaySchedule = {
    home: [block('Manhã', '06:30', '10:45'), block('Noite', '18:30', '23:00')],
    capacity: 60, dinner: true, morning_kids: true, evening: true,
  };
  const wednesday: DaySchedule = {
    home: [block('Noite', '18:30', '23:00')], capacity: 10, dinner: true, morning_kids: false, evening: true,
  };
  const saturday: DaySchedule = {
    home: [block('Dia todo', '07:30', '23:00')], capacity: 100, dinner: true, morning_kids: true, evening: true,
  };
  const sunday: DaySchedule = { ...saturday, capacity: 60 };
  return [sunday, workday, workday, wednesday, workday, workday, saturday];
}

export function defaultSettings(eduardoId: string, jussaraId: string, inaeId: string, child2Id: string): HouseholdSettings {
  return {
    target_share: { [eduardoId]: 0.5, [jussaraId]: 0.5 },
    rest_reserve: 0.15,
    light_days: [3],
    weekend_max_minutes: 60,
    coverage_min_minutes: 30,
    coverage_load_factor: 0,
    balance_tolerance: 12,
    gamification: true,
    ai_enabled: false,
    weekly_goal_points: { [inaeId]: 40, [child2Id]: 20 },
    outing_goal_per_weekend: 1,
    notifications: {
      enabled: true,
      lead_minutes: 15,
      daily_summary_time: '07:30',
      overdue_time: '21:30',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      partner_changes: true,
      categories: { market: true, homework: true, outing: true, clothes: true, recurring: true },
    },
    onboarding_done: false,
  };
}

export interface SeedIds {
  household: string;
  eduardo: string;
  jussara: string;
  inae: string;
  child2: string;
}

export function seedIds(householdId: string): SeedIds {
  return {
    household: householdId,
    eduardo: stableId(`${householdId}:member:eduardo`),
    jussara: stableId(`${householdId}:member:jussara`),
    inae: stableId(`${householdId}:member:inae`),
    child2: stableId(`${householdId}:member:child2`),
  };
}

export function seedHousehold(ids: SeedIds, inviteCode: string | null, now = SEED_EPOCH): Household {
  return {
    id: ids.household,
    name: 'Nossa Casa',
    invite_code: inviteCode,
    settings: defaultSettings(ids.eduardo, ids.jussara, ids.inae, ids.child2),
    created_at: now,
    updated_at: now,
  };
}

export function seedMembers(ids: SeedIds, now = SEED_EPOCH): Member[] {
  const base = { household_id: ids.household, user_id: null, created_at: now, updated_at: now, deleted: false };
  return [
    {
      ...base, id: ids.eduardo, name: 'Eduardo', kind: 'adult', role: 'admin', color: '#3B7DD8', emoji: '👨',
      schedule: eduardoSchedule(), preferences: {}, age: null, sort: 1,
    },
    {
      ...base, id: ids.jussara, name: 'Jussara', kind: 'adult', role: 'admin', color: '#D8537B', emoji: '👩',
      schedule: jussaraSchedule(),
      preferences: { roupas: 3, lavanderia: 2, organizacao: 3, plantas: 3, sapatos: 3 },
      age: null, sort: 2,
    },
    {
      ...base, id: ids.inae, name: 'Inaê', kind: 'child', role: 'child', color: '#F2A93B', emoji: '👧',
      schedule: null, preferences: {}, age: 6, sort: 3,
    },
    {
      ...base, id: ids.child2, name: 'Ian', kind: 'child', role: 'child', color: '#4FB286', emoji: '👦',
      schedule: null, preferences: {}, age: 3, sort: 4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

type Freq =
  | 'D' // diária
  | 'W' // semanal
  | 'B' // quinzenal
  | 'M' // mensal
  | `X${number}` // a cada X dias
  | Weekday[]; // dias fixos

interface T {
  t: string; // título
  c: CategoryId;
  m: number; // minutos
  e: Effort;
  p: Priority;
  f: Freq;
  room?: string | null;
  rule?: RuleTag;
  slot?: Slot;
  time?: string;
  kind?: TaskKind;
  mode?: AssignMode;
  who?: 'inae' | 'child2';
  pts?: number;
  notes?: string;
}

function recurrence(f: Freq): Recurrence {
  if (Array.isArray(f)) return { type: 'custom', weekdays: f };
  if (f === 'D') return { type: 'daily' };
  if (f === 'W') return { type: 'weekly' };
  if (f === 'B') return { type: 'biweekly' };
  if (f === 'M') return { type: 'monthly' };
  return { type: 'every_x_days', interval: Number(f.slice(1)) };
}

const room = (r: string, list: Omit<T, 'room'>[]): T[] => list.map((x) => ({ ...x, room: r }));

export const SEED_TASKS: T[] = [
  // QUARTO DO CASAL
  ...room('Quarto do casal', [
    { t: 'Varrer e passar pano no chão', c: 'quartos', m: 20, e: 2, p: 'medium', f: 'W' },
    { t: 'Tirar pó de cima do guarda-roupa e armários', c: 'quartos', m: 15, e: 1, p: 'low', f: 'M' },
    { t: 'Tirar manchas do lado de fora do guarda-roupa e espelhos', c: 'quartos', m: 15, e: 1, p: 'low', f: 'B' },
    { t: 'Organizar dentro do guarda-roupa e armários', c: 'organizacao', m: 45, e: 2, p: 'low', f: 'M', mode: 'shared' },
    { t: 'Limpar janela', c: 'quartos', m: 20, e: 2, p: 'low', f: 'M' },
    { t: 'Organizar baú da cama', c: 'organizacao', m: 30, e: 2, p: 'low', f: 'M' },
    { t: 'Limpar banquinho', c: 'quartos', m: 5, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar ventilador', c: 'quartos', m: 15, e: 1, p: 'low', f: 'M' },
    { t: 'Organizar e limpar caixas de remédios e acessórios', c: 'organizacao', m: 20, e: 1, p: 'medium', f: 'M' },
    { t: 'Lavar roupas de cama', c: 'roupas', m: 20, e: 2, p: 'medium', f: 'W' },
  ]),
  // QUARTO DAS CRIANÇAS
  ...room('Quarto das crianças', [
    { t: 'Varrer e passar pano', c: 'quartos', m: 20, e: 2, p: 'medium', f: 'W' },
    { t: 'Tirar pó de cima do guarda-roupa', c: 'quartos', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Tirar manchas do lado de fora do guarda-roupa', c: 'quartos', m: 10, e: 1, p: 'low', f: 'B' },
    { t: 'Organizar dentro do guarda-roupa', c: 'organizacao', m: 30, e: 2, p: 'low', f: 'M' },
    { t: 'Tirar pó das prateleiras', c: 'quartos', m: 10, e: 1, p: 'low', f: 'B' },
    { t: 'Organizar caixas', c: 'organizacao', m: 20, e: 1, p: 'low', f: 'M' },
    { t: 'Tirar pó e organizar gaveteiro preto', c: 'organizacao', m: 15, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar janela', c: 'quartos', m: 20, e: 2, p: 'low', f: 'M' },
    { t: 'Lavar roupas de cama', c: 'roupas', m: 20, e: 2, p: 'medium', f: 'W' },
  ]),
  // BANHEIRO
  ...room('Banheiro', [
    { t: 'Lavar azulejos', c: 'banheiro', m: 30, e: 3, p: 'medium', f: 'B' },
    { t: 'Limpar box', c: 'banheiro', m: 20, e: 2, p: 'high', f: 'W' },
    { t: 'Lavar chão', c: 'banheiro', m: 15, e: 2, p: 'high', f: 'W' },
    { t: 'Limpar vaso sanitário', c: 'banheiro', m: 10, e: 2, p: 'high', f: 'X4' },
    { t: 'Limpar pia', c: 'banheiro', m: 5, e: 1, p: 'high', f: 'W' },
    { t: 'Limpar armário', c: 'banheiro', m: 15, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar vitrô', c: 'banheiro', m: 15, e: 2, p: 'low', f: 'M' },
    { t: 'Limpar prateleiras', c: 'banheiro', m: 10, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar saboneteira', c: 'banheiro', m: 5, e: 1, p: 'low', f: 'W' },
    { t: 'Higienizar lixo', c: 'banheiro', m: 10, e: 2, p: 'medium', f: 'W' },
    { t: 'Higienizar cesto de roupa', c: 'banheiro', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar banquinho', c: 'banheiro', m: 5, e: 1, p: 'low', f: 'B' },
    { t: 'Lavar toalhas', c: 'roupas', m: 15, e: 1, p: 'medium', f: 'W' },
  ]),
  // COZINHA E LAVANDERIA
  ...room('Cozinha e lavanderia', [
    { t: 'Limpar chão', c: 'cozinha', m: 15, e: 2, p: 'high', f: 'X4' },
    { t: 'Limpar prateleiras', c: 'cozinha', m: 15, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar armários por cima', c: 'cozinha', m: 15, e: 2, p: 'low', f: 'M' },
    { t: 'Limpar armários por fora', c: 'cozinha', m: 20, e: 2, p: 'low', f: 'B' },
    { t: 'Limpar armários por dentro', c: 'cozinha', m: 60, e: 3, p: 'low', f: 'X60', mode: 'shared' },
    { t: 'Limpar sapateira por dentro', c: 'sapatos', m: 20, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar sapateira por fora', c: 'sapatos', m: 10, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar cooler', c: 'cozinha', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar cesto de roupa', c: 'lavanderia', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar forno', c: 'cozinha', m: 30, e: 3, p: 'low', f: 'M' },
    { t: 'Limpar parte externa do fogão', c: 'cozinha', m: 10, e: 1, p: 'medium', f: 'W' },
    { t: 'Limpar micro-ondas por dentro', c: 'cozinha', m: 10, e: 1, p: 'medium', f: 'W' },
    { t: 'Limpar micro-ondas por fora', c: 'cozinha', m: 5, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar geladeira por dentro', c: 'cozinha', m: 45, e: 3, p: 'medium', f: 'M' },
    { t: 'Limpar geladeira por fora', c: 'cozinha', m: 10, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar pia', c: 'cozinha', m: 10, e: 1, p: 'high', f: 'X3' },
    { t: 'Lavar pedra da pia', c: 'cozinha', m: 10, e: 1, p: 'medium', f: 'W' },
    { t: 'Lavar cuba', c: 'cozinha', m: 10, e: 1, p: 'medium', f: 'W' },
    { t: 'Limpar escorredor', c: 'cozinha', m: 10, e: 1, p: 'medium', f: 'W' },
    { t: 'Limpar torneira', c: 'cozinha', m: 5, e: 1, p: 'low', f: 'W' },
    { t: 'Limpar recipiente de detergente', c: 'cozinha', m: 5, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar azulejos', c: 'cozinha', m: 30, e: 2, p: 'low', f: 'M' },
    { t: 'Limpar tanque', c: 'lavanderia', m: 15, e: 2, p: 'low', f: 'B' },
    { t: 'Tirar pó das caixas contêiner', c: 'lavanderia', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Higienizar lixo', c: 'cozinha', m: 10, e: 2, p: 'medium', f: 'W' },
    { t: 'Lavar panos de prato', c: 'lavanderia', m: 10, e: 1, p: 'medium', f: 'X4' },
    { t: 'Lavar toalhas de mesa', c: 'lavanderia', m: 10, e: 1, p: 'low', f: 'W' },
    { t: 'Limpar vitrô', c: 'cozinha', m: 15, e: 2, p: 'low', f: 'M' },
  ]),
  // SALA
  ...room('Sala', [
    { t: 'Limpar sofá', c: 'sala', m: 20, e: 2, p: 'medium', f: 'B' },
    { t: 'Tirar pó do armário abaixo da televisão', c: 'sala', m: 10, e: 1, p: 'medium', f: 'W' },
    { t: 'Organizar interior do armário abaixo da televisão', c: 'organizacao', m: 20, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar televisão', c: 'sala', m: 5, e: 1, p: 'low', f: 'W' },
    { t: 'Limpar mesa', c: 'sala', m: 5, e: 1, p: 'medium', f: 'W' },
    { t: 'Limpar cadeiras', c: 'sala', m: 15, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar mesinha das crianças', c: 'sala', m: 5, e: 1, p: 'medium', f: 'W' },
    { t: 'Limpar cadeirinhas das crianças', c: 'sala', m: 5, e: 1, p: 'low', f: 'B' },
    { t: 'Limpar porta-balcão', c: 'sala', m: 20, e: 2, p: 'low', f: 'M' },
    { t: 'Lavar itens do sofá', c: 'roupas', m: 20, e: 2, p: 'low', f: 'M' },
    { t: 'Lavar cortina', c: 'roupas', m: 30, e: 2, p: 'low', f: 'X90' },
  ]),
  // SACADA
  ...room('Sacada', [
    { t: 'Limpar parapeito', c: 'sacada', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Molhar plantas', c: 'plantas', m: 10, e: 1, p: 'high', f: [1, 4, 6], slot: 'morning', time: '08:30' },
    { t: 'Limpar prateleiras', c: 'sacada', m: 10, e: 1, p: 'low', f: 'M' },
    { t: 'Limpar chão', c: 'sacada', m: 15, e: 2, p: 'low', f: 'W' },
  ]),
  // GERAL
  ...room('Geral', [
    { t: 'Limpar portas de madeira', c: 'geral', m: 30, e: 2, p: 'low', f: 'M' },
    { t: 'Limpar manchas das paredes', c: 'geral', m: 20, e: 2, p: 'low', f: 'M' },
    { t: 'Remover mofo das paredes', c: 'geral', m: 45, e: 3, p: 'medium', f: 'M' },
    { t: 'Lavar roupas', c: 'roupas', m: 15, e: 1, p: 'high', f: [1, 4, 6], slot: 'morning', time: '07:30' },
    { t: 'Pendurar roupas', c: 'roupas', m: 10, e: 1, p: 'high', f: [1, 4, 6], slot: 'morning', time: '09:30' },
    { t: 'Recolher roupas', c: 'roupas', m: 10, e: 1, p: 'medium', f: [2, 5, 0], time: '19:00' },
    { t: 'Dobrar roupas', c: 'roupas', m: 20, e: 1, p: 'medium', f: [2, 5, 0] },
    { t: 'Guardar roupas', c: 'roupas', m: 10, e: 1, p: 'medium', f: [2, 5, 0] },
    { t: 'Limpar hall de entrada na frente da porta do apartamento', c: 'geral', m: 10, e: 1, p: 'low', f: 'B' },
    { t: 'Lavar tapetes', c: 'lavanderia', m: 30, e: 2, p: 'low', f: 'M' },
  ]),
  // ROTINA DIÁRIA
  ...room('Rotina diária', [
    { t: 'Cozinhar', c: 'cozinha', m: 50, e: 2, p: 'high', f: 'D', rule: 'cook', slot: 'evening', time: '18:45' },
    { t: 'Lavar louça', c: 'cozinha', m: 25, e: 2, p: 'high', f: 'D', rule: 'dishes', slot: 'evening', time: '20:00' },
    { t: 'Limpar fogão', c: 'cozinha', m: 5, e: 1, p: 'high', f: 'D', rule: 'stove', slot: 'evening', time: '20:15' },
    { t: 'Guardar louça', c: 'cozinha', m: 10, e: 1, p: 'medium', f: 'D' },
    { t: 'Arrumar camas', c: 'quartos', m: 10, e: 1, p: 'medium', f: 'D', slot: 'morning' },
    { t: 'Arrumar sofá', c: 'sala', m: 5, e: 1, p: 'low', f: 'D' },
    { t: 'Retirar lixo', c: 'geral', m: 5, e: 1, p: 'high', f: 'D', slot: 'evening', time: '21:00' },
    { t: 'Limpar sapatos sujos', c: 'sapatos', m: 10, e: 1, p: 'medium', f: 'D' },
    {
      t: 'Rotina de sono das crianças', c: 'criancas', m: 45, e: 2, p: 'high', f: 'D', rule: 'sleep_routine',
      slot: 'evening', time: '20:30',
      notes: 'Banho (quando aplicável), pijama, escovar dentes, organizar quarto, colocar para dormir e acompanhar até dormirem.',
    },
    {
      t: 'Café da manhã e preparar crianças para a escola', c: 'criancas', m: 75, e: 2, p: 'high', f: [1, 2, 4, 5],
      rule: 'morning_kids', slot: 'morning', time: '07:00',
    },
    { t: 'Café da manhã das crianças', c: 'criancas', m: 30, e: 1, p: 'high', f: [6, 0], slot: 'morning', time: '08:00' },
  ]),
  // MERCADO e ESCOLA
  { t: 'Fazer mercado', c: 'mercado', m: 90, e: 2, p: 'high', f: [6], rule: 'market', slot: 'morning', time: '09:30', kind: 'market' },
  {
    t: 'Lição de casa da Inaê', c: 'escola', m: 45, e: 2, p: 'high', f: [6], rule: 'homework', slot: 'afternoon',
    time: '15:00', kind: 'homework', notes: 'Acompanhar a Inaê na lição. Registre as atividades na tela "Lição de casa".',
  },
  // MISSÕES DA INAÊ
  ...[
    { t: 'Guardar brinquedos', f: 'D' as Freq, pts: 2 },
    { t: 'Guardar livros', f: 'D' as Freq, pts: 1 },
    { t: 'Colocar roupas sujas no cesto', f: 'D' as Freq, pts: 1 },
    { t: 'Organizar material escolar', f: [0, 1, 2, 3, 4] as Freq, pts: 2 },
    { t: 'Arrumar mochila', f: [0, 1, 2, 3, 4] as Freq, pts: 2 },
    { t: 'Guardar sapatos', f: 'D' as Freq, pts: 1 },
    { t: 'Ajudar a organizar a própria cama', f: 'D' as Freq, pts: 2 },
    { t: 'Ajudar a colocar a mesa', f: 'D' as Freq, pts: 2 },
    { t: 'Guardar objetos pessoais', f: 'D' as Freq, pts: 1 },
    { t: 'Fazer lição de casa', f: [6] as Freq, pts: 5, c: 'escola' as CategoryId },
  ].map((x): T => ({
    t: x.t, c: x.c ?? 'criancas', m: 10, e: 1, p: 'medium', f: x.f, kind: 'mission', who: 'inae', pts: x.pts, mode: 'fixed',
  })),
  // MISSÕES DA CRIANÇA MENOR (sempre com supervisão)
  ...[
    'Guardar brinquedos', 'Guardar livros', 'Colocar brinquedos no lugar',
    'Colocar roupa suja no cesto', 'Guardar sapatos', 'Ajudar a guardar objetos',
  ].map((t): T => ({
    t, c: 'criancas', m: 5, e: 1, p: 'low', f: 'D', kind: 'mission', who: 'child2', pts: 1, mode: 'fixed',
    notes: 'Com supervisão de um adulto.',
  })),
];

export function seedTemplates(ids: SeedIds, now = SEED_EPOCH): TaskTemplate[] {
  const seen = new Map<string, number>();
  const titleCount = new Map<string, number>();
  for (const x of SEED_TASKS) if (!x.who) titleCount.set(x.t, (titleCount.get(x.t) ?? 0) + 1);
  let spread = 0;
  return SEED_TASKS.map((x) => {
    // Espalha as tarefas quinzenais/mensais pelas semanas do mês, para não caírem todas juntas.
    const f = x.f;
    const spaced = f === 'B' || f === 'M' || (typeof f === 'string' && f.startsWith('X') && Number(f.slice(1)) >= 14);
    const offsetWeeks = spaced ? spread++ % (f === 'B' ? 2 : 4) : 0;
    const start = addDaysISO('2026-01-05', offsetWeeks * 7 + (spaced ? spread % 3 : 0));
    const baseKey = `${x.who ?? ''}:${x.room ?? ''}:${x.t}`;
    const n = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, n);
    const assignee = x.who === 'inae' ? [ids.inae] : x.who === 'child2' ? [ids.child2] : x.mode === 'shared' ? [ids.eduardo, ids.jussara] : [];
    return {
      id: stableId(`${ids.household}:tpl:${baseKey}:${n}`),
      household_id: ids.household,
      // Títulos repetidos em cômodos diferentes ganham o cômodo (ex.: "Limpar janela — Quarto do casal").
      title: !x.who && (titleCount.get(x.t) ?? 0) > 1 && x.room ? `${x.t} — ${x.room}` : x.t,
      category: x.c,
      room: x.room ?? null,
      kind: x.kind ?? 'chore',
      effort: x.e,
      minutes: x.m,
      priority: x.p,
      recurrence: { ...recurrence(x.f), start },
      assign_mode: x.mode ?? 'auto',
      assignee_ids: assignee,
      rule_tag: x.rule ?? null,
      slot: x.slot ?? 'any',
      due_time: x.time ?? null,
      points: x.pts ?? 0,
      notes: x.notes ?? null,
      active: true,
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now,
      deleted: false,
    };
  });
}

/** Frequência sugerida para uma tarefa nova, pelo título (o usuário pode trocar). */
export function suggestRecurrence(title: string): Recurrence {
  const t = title.toLowerCase();
  if (/geladeira|forno|armários por dentro|mofo|portas|janela|ventilador|tapete|cortina/.test(t)) return { type: 'monthly' };
  if (/azulejo|sofá|prateleira|poeira|pó|quinzen/.test(t)) return { type: 'biweekly' };
  if (/roupa de cama|banheiro|box|chão|toalha|lixo|mercado/.test(t)) return { type: 'weekly' };
  if (/louça|cozinhar|cama|lixo|sapato|plantas/.test(t)) return { type: 'daily' };
  return { type: 'weekly' };
}
