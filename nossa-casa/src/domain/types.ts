// Tipos do domínio do Nossa Casa.
// Tudo aqui é serializável em JSON e espelha as tabelas do Supabase
// (ver supabase/migrations/001_nossa_casa.sql).

export type ISODate = string; // 'YYYY-MM-DD'
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo ... 6 = sábado

export type CategoryId =
  | 'limpeza'
  | 'roupas'
  | 'cozinha'
  | 'lavanderia'
  | 'criancas'
  | 'escola'
  | 'plantas'
  | 'sapatos'
  | 'mercado'
  | 'organizacao'
  | 'familia'
  | 'quartos'
  | 'banheiro'
  | 'sala'
  | 'sacada'
  | 'geral'
  | 'cobertura';

export type Priority = 'high' | 'medium' | 'low';
/** Peso (esforço) da tarefa: 1 = baixo, 2 = médio, 3 = alto. */
export type Effort = 1 | 2 | 3;

export type RecurrenceType =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'every_x_days'
  | 'custom';

export interface Recurrence {
  type: RecurrenceType;
  /** every_x_days: intervalo em dias. */
  interval?: number;
  /** daily/custom/weekly: dias fixos da semana (se vazio, o planejador escolhe o dia). */
  weekdays?: Weekday[];
  /** Data âncora (início) da recorrência. */
  start?: ISODate;
  /** once: data da tarefa (opcional; sem data = o planejador escolhe na semana). */
  date?: ISODate;
}

/**
 * Regras especiais que o planejador entende.
 * - cook: cozinhar (arrasta lavar louça + limpar fogão para a mesma pessoa)
 * - dishes / stove: fazem parte do pacote de quem cozinha
 * - sleep_routine: rotina de sono (nunca para quem lavou a louça no dia)
 * - morning_kids: café da manhã + preparar crianças para a escola
 * - market: fazer mercado
 * - homework: lição de casa
 */
export type RuleTag =
  | 'cook'
  | 'dishes'
  | 'stove'
  | 'sleep_routine'
  | 'morning_kids'
  | 'market'
  | 'homework'
  | null;

export type AssignMode = 'auto' | 'fixed' | 'shared';
export type TaskKind = 'chore' | 'mission' | 'coverage' | 'homework' | 'market';
export type Slot = 'morning' | 'afternoon' | 'evening' | 'any';

export interface TaskTemplate {
  id: string;
  household_id: string;
  title: string;
  category: CategoryId;
  room: string | null;
  kind: TaskKind;
  effort: Effort;
  minutes: number;
  priority: Priority;
  recurrence: Recurrence;
  assign_mode: AssignMode;
  /** fixed: pessoa(s) fixa(s); shared: os dois adultos; mission: a criança. */
  assignee_ids: string[];
  rule_tag: RuleTag;
  slot: Slot;
  /** Horário sugerido 'HH:MM' (usado nas notificações). */
  due_time: string | null;
  points: number;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export type InstanceStatus = 'pending' | 'done' | 'skipped' | 'cancelled';

export interface TaskInstance {
  id: string;
  household_id: string;
  template_id: string | null;
  /** Chave da ocorrência (ex.: 'W2026-09-21'); com template_id identifica a ocorrência. */
  occurrence: string | null;
  title: string;
  category: CategoryId;
  kind: TaskKind;
  date: ISODate;
  due_time: string | null;
  slot: Slot;
  minutes: number;
  effort: Effort;
  priority: Priority;
  assignee_ids: string[];
  status: InstanceStatus;
  /** Quem registrou participação/conclusão (tarefas compartilhadas aceitam os dois). */
  completed_by: string[];
  completed_at: string | null;
  /** Agrupa tarefas simultâneas (ex.: tarefa + cobertura das crianças) ou o pacote da cozinha. */
  group_id: string | null;
  rule_tag: RuleTag;
  /** Atribuição feita manualmente — o "reorganizar" não mexe. */
  locked: boolean;
  postponed_count: number;
  points: number;
  actual_seconds: number;
  timer_started_at: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface TimeBlock {
  label: string;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
}

export interface DaySchedule {
  /** Blocos em que a pessoa está em casa. */
  home: TimeBlock[];
  /** Minutos disponíveis para tarefas domésticas extras (fora da rotina fixa). */
  capacity: number;
  /** Está em casa no horário do jantar (pode cozinhar)? */
  dinner: boolean;
  /** Está em casa pela manhã com as crianças (café/escola)? */
  morning_kids: boolean;
  /** Está em casa à noite (pode fazer a rotina de sono)? */
  evening: boolean;
}

export interface Member {
  id: string;
  household_id: string;
  user_id: string | null;
  name: string;
  kind: 'adult' | 'child';
  role: 'admin' | 'child';
  color: string;
  emoji: string;
  /** Adultos: agenda por dia da semana (índice 0 = domingo). */
  schedule: DaySchedule[] | null;
  /** Preferências: categoria -> peso (0..3). */
  preferences: Partial<Record<CategoryId, number>>;
  /** Crianças: idade aproximada (para missões). */
  age: number | null;
  sort: number;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  lead_minutes: number;
  daily_summary_time: string; // 'HH:MM'
  overdue_time: string; // 'HH:MM'
  weekdays: Weekday[];
  partner_changes: boolean;
  categories: { market: boolean; homework: boolean; outing: boolean; clothes: boolean; recurring: boolean };
}

export interface HouseholdSettings {
  /** Fração da carga doméstica total que cada adulto deveria assumir (member_id -> 0..1). */
  target_share: Record<string, number>;
  /** Fração da capacidade diária preservada para descanso (0..0.9). */
  rest_reserve: number;
  /** Dias "leves": sem tarefas pesadas. */
  light_days: Weekday[];
  /** Limite de minutos de tarefas extras por pessoa em cada dia do fim de semana. */
  weekend_max_minutes: number;
  /** Tarefas a partir deste tempo geram uma "cobertura das crianças" para o outro adulto. */
  coverage_min_minutes: number;
  /** Quanto a cobertura conta como carga (0 = não conta, 1 = conta como tarefa). */
  coverage_load_factor: number;
  /** Diferença (em %) a partir da qual o equilíbrio é considerado significativo. */
  balance_tolerance: number;
  gamification: boolean;
  /** Usa a IA na nuvem (função `assistant` do Supabase) para perguntas livres. */
  ai_enabled: boolean;
  weekly_goal_points: Record<string, number>;
  outing_goal_per_weekend: number;
  notifications: NotificationSettings;
  onboarding_done: boolean;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string | null;
  settings: HouseholdSettings;
  created_at: string;
  updated_at: string;
}

export interface ShoppingItem {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  bought: boolean;
  bought_by: string | null;
  bought_at: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface Homework {
  id: string;
  household_id: string;
  child_id: string;
  activity: string;
  subject: string | null;
  due_date: ISODate | null;
  note: string | null;
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export type EventType = 'outing' | 'appointment';

export interface FamilyEvent {
  id: string;
  household_id: string;
  type: EventType;
  title: string;
  place_type: string | null;
  date: ISODate;
  time: string | null;
  participant_ids: string[];
  notes: string | null;
  done: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export type LogAction =
  | 'created'
  | 'updated'
  | 'completed'
  | 'reopened'
  | 'transferred'
  | 'postponed'
  | 'cancelled'
  | 'deleted';

export interface ActivityLog {
  id: string;
  household_id: string;
  actor_id: string | null;
  action: LogAction;
  entity: string;
  entity_id: string;
  title: string;
  category: CategoryId | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Snapshot {
  household: Household | null;
  members: Member[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
  shopping: ShoppingItem[];
  homework: Homework[];
  events: FamilyEvent[];
  logs: ActivityLog[];
}
