// Ações do aplicativo (o que os botões fazem). Cada ação altera o estado local,
// registra no histórico quem fez o quê, e a Store cuida de sincronizar.
import { addDays, today as todayISO, weekStart } from '../domain/dates';
import { randomId } from '../domain/ids';
import { relaxedRecurrence } from '../domain/insights';
import { planWeek, type PlanResult } from '../domain/planner';
import { propagateRules } from '../domain/rules';
import type {
  ActivityLog, CategoryId, FamilyEvent, Homework, HouseholdSettings, LogAction, Member, ShoppingItem, TaskInstance, TaskTemplate,
} from '../domain/types';
import type { Store } from './store';

export class Actions {
  constructor(private s: Store) {}

  private get st() {
    return this.s.state;
  }

  me(): Member | undefined {
    return this.st.members.find((m) => m.id === this.st.meId);
  }

  adults() {
    return this.st.members.filter((m) => m.kind === 'adult' && !m.deleted).sort((a, b) => a.sort - b.sort);
  }

  private inst(id: string) {
    return this.st.instances.find((i) => i.id === id);
  }

  log(action: LogAction, entity: string, entityId: string, title: string, category: CategoryId | null, details: Record<string, unknown> = {}) {
    const h = this.st.household;
    if (!h) return;
    const row: ActivityLog = {
      id: randomId(),
      household_id: h.id,
      actor_id: this.st.meId,
      action,
      entity,
      entity_id: entityId,
      title,
      category,
      details,
      created_at: this.s.now,
    };
    this.s.upsert('activity_log', [row]);
  }

  // ------------------------------------------------------------ tarefas do dia
  complete(id: string, by: string | null = this.st.meId) {
    const i = this.inst(id);
    if (!i || i.status === 'done') return;
    const extra = i.timer_started_at ? Math.max(0, Math.round((Date.parse(this.s.now) - Date.parse(i.timer_started_at)) / 1000)) : 0;
    const completed_by = by && !i.completed_by.includes(by) ? [...i.completed_by, by] : i.completed_by;
    this.s.patch('task_instances', id, {
      status: 'done',
      completed_by,
      completed_at: this.s.now,
      timer_started_at: null,
      actual_seconds: i.actual_seconds + extra,
    });
    this.log('completed', 'task', id, i.title, i.category, { date: i.date, seconds: i.actual_seconds + extra });
  }

  reopen(id: string) {
    const i = this.inst(id);
    if (!i || i.status === 'pending') return;
    this.s.patch('task_instances', id, { status: 'pending', completed_at: null, completed_by: [] });
    this.log('reopened', 'task', id, i.title, i.category);
  }

  toggle(id: string) {
    const i = this.inst(id);
    if (!i) return;
    if (i.status === 'done') this.reopen(id);
    else this.complete(id);
  }

  /** Tarefa compartilhada: registrar que participei (sem necessariamente concluir). */
  participate(id: string, memberId = this.st.meId) {
    const i = this.inst(id);
    if (!i || !memberId) return;
    const has = i.completed_by.includes(memberId);
    const completed_by = has ? i.completed_by.filter((m) => m !== memberId) : [...i.completed_by, memberId];
    this.s.patch('task_instances', id, { completed_by });
    if (!has) this.log('updated', 'task', id, i.title, i.category, { participation: memberId });
  }

  /** Troca responsáveis e aplica as regras da cozinha / sono no mesmo dia. */
  setAssignees(id: string, assignees: string[]): string[] {
    const i = this.inst(id);
    if (!i) return [];
    const before = i.assignee_ids;
    this.s.patch('task_instances', id, { assignee_ids: assignees, locked: true });
    const names = (ids: string[]) => ids.map((x) => this.st.members.find((m) => m.id === x)?.name ?? '?').join(' + ');
    this.log('transferred', 'task', id, i.title, i.category, { from: names(before), to: names(assignees) });
    const changed = { ...i, assignee_ids: assignees };
    const patches = propagateRules(changed, this.st.instances.filter((x) => x.date === i.date), this.adults());
    const reasons: string[] = [];
    for (const p of patches) {
      const other = this.inst(p.id);
      if (!other) continue;
      this.s.patch('task_instances', p.id, { assignee_ids: p.assignee_ids, locked: true });
      this.log('transferred', 'task', p.id, other.title, other.category, { from: names(other.assignee_ids), to: names(p.assignee_ids), rule: p.reason });
      if (!reasons.includes(p.reason)) reasons.push(p.reason);
    }
    return reasons;
  }

  postpone(id: string, days = 1) {
    const i = this.inst(id);
    if (!i) return;
    const base = i.date < todayISO() ? todayISO() : i.date;
    const date = addDays(base, days);
    this.s.patch('task_instances', id, { date, postponed_count: i.postponed_count + 1 });
    this.log('postponed', 'task', id, i.title, i.category, { from: i.date, to: date });
    // A cobertura das crianças acompanha a tarefa.
    for (const c of this.st.instances.filter((x) => x.group_id === id && x.kind === 'coverage' && x.status === 'pending')) {
      this.s.patch('task_instances', c.id, { date });
    }
  }

  moveTo(id: string, date: string) {
    const i = this.inst(id);
    if (!i) return;
    this.s.patch('task_instances', id, { date, locked: true });
    this.log('updated', 'task', id, i.title, i.category, { from: i.date, to: date });
  }

  cancel(id: string) {
    const i = this.inst(id);
    if (!i) return;
    this.s.patch('task_instances', id, { status: 'cancelled' });
    this.log('cancelled', 'task', id, i.title, i.category, { date: i.date });
    for (const c of this.st.instances.filter((x) => x.group_id === id && x.kind === 'coverage' && x.status === 'pending')) {
      this.s.patch('task_instances', c.id, { status: 'cancelled' });
    }
  }

  removeInstance(id: string) {
    const i = this.inst(id);
    if (!i) return;
    this.s.patch('task_instances', id, { deleted: true });
    this.log('deleted', 'task', id, i.title, i.category);
  }

  updateInstance(id: string, patch: Partial<Pick<TaskInstance, 'title' | 'minutes' | 'effort' | 'priority' | 'due_time' | 'notes' | 'category' | 'date'>>) {
    const i = this.inst(id);
    if (!i) return;
    this.s.patch('task_instances', id, patch);
    this.log('updated', 'task', id, patch.title ?? i.title, i.category, { fields: Object.keys(patch) });
  }

  // Cronômetro (só para planejar melhor — nunca para fiscalizar).
  startTimer(id: string) {
    const i = this.inst(id);
    if (!i || i.timer_started_at) return;
    this.s.patch('task_instances', id, { timer_started_at: this.s.now });
  }

  pauseTimer(id: string) {
    const i = this.inst(id);
    if (!i || !i.timer_started_at) return;
    const extra = Math.max(0, Math.round((Date.parse(this.s.now) - Date.parse(i.timer_started_at)) / 1000));
    this.s.patch('task_instances', id, { timer_started_at: null, actual_seconds: i.actual_seconds + extra });
  }

  /** Tarefa avulsa (sem repetição). */
  addOneOff(input: { title: string; category: CategoryId; date: string; minutes: number; effort: 1 | 2 | 3; priority: TaskInstance['priority']; assignee_ids: string[]; due_time?: string | null; notes?: string | null; kind?: TaskInstance['kind']; points?: number }) {
    const h = this.st.household;
    if (!h) return;
    const now = this.s.now;
    const row: TaskInstance = {
      id: randomId(),
      household_id: h.id,
      template_id: null,
      occurrence: null,
      title: input.title,
      category: input.category,
      kind: input.kind ?? 'chore',
      date: input.date,
      due_time: input.due_time ?? null,
      slot: 'any',
      minutes: input.minutes,
      effort: input.effort,
      priority: input.priority,
      assignee_ids: input.assignee_ids,
      status: 'pending',
      completed_by: [],
      completed_at: null,
      group_id: null,
      rule_tag: null,
      locked: input.assignee_ids.length > 0,
      postponed_count: 0,
      points: input.points ?? 0,
      actual_seconds: 0,
      timer_started_at: null,
      notes: input.notes ?? null,
      created_by: this.st.meId,
      updated_by: this.st.meId,
      created_at: now,
      updated_at: now,
      deleted: false,
    };
    this.s.upsert('task_instances', [row]);
    this.log('created', 'task', row.id, row.title, row.category, { date: row.date });
    return row;
  }

  // ------------------------------------------------------------ modelos (tarefas cadastradas)
  saveTemplate(tpl: TaskTemplate) {
    const existing = this.st.templates.find((t) => t.id === tpl.id);
    const now = this.s.now;
    if (!existing) {
      this.s.upsert('task_templates', [{ ...tpl, created_at: now, updated_at: now, created_by: this.st.meId, updated_by: this.st.meId }]);
      this.log('created', 'template', tpl.id, tpl.title, tpl.category);
    } else {
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(tpl) as (keyof TaskTemplate)[]) {
        if (k === 'updated_at' || k === 'created_at') continue;
        if (JSON.stringify(tpl[k]) !== JSON.stringify(existing[k])) patch[k] = tpl[k];
      }
      if (!Object.keys(patch).length) return;
      this.s.patch('task_templates', tpl.id, patch);
      this.log('updated', 'template', tpl.id, tpl.title, tpl.category, { fields: Object.keys(patch) });
      // Atualiza as próximas ocorrências ainda pendentes.
      const t = todayISO();
      const future = this.st.instances.filter((i) => i.template_id === tpl.id && i.status === 'pending' && i.date >= t && !i.deleted);
      const recurrenceChanged = 'recurrence' in patch || 'assign_mode' in patch || 'assignee_ids' in patch || 'active' in patch;
      for (const i of future) {
        if (recurrenceChanged && !i.locked) {
          this.s.patch('task_instances', i.id, { deleted: true });
        } else {
          const p: Record<string, unknown> = {};
          for (const k of ['title', 'category', 'minutes', 'effort', 'priority', 'due_time', 'notes', 'points'] as const) if (k in patch) p[k] = tpl[k];
          if (Object.keys(p).length) this.s.patch('task_instances', i.id, p);
        }
      }
    }
    this.ensurePlanned();
  }

  deleteTemplate(id: string) {
    const tpl = this.st.templates.find((t) => t.id === id);
    if (!tpl) return;
    this.s.patch('task_templates', id, { deleted: true, active: false });
    const t = todayISO();
    for (const i of this.st.instances.filter((x) => x.template_id === id && x.status === 'pending' && x.date >= t)) {
      this.s.patch('task_instances', i.id, { deleted: true });
    }
    this.log('deleted', 'template', id, tpl.title, tpl.category);
  }

  // ------------------------------------------------------------ planejamento
  private applyPlan(res: PlanResult) {
    const inserts: TaskInstance[] = [];
    for (const c of res.changes) {
      const local = this.inst(c.instance.id);
      if (!local) {
        inserts.push(c.instance);
      } else {
        this.s.patch('task_instances', c.instance.id, {
          date: c.instance.date,
          assignee_ids: c.instance.assignee_ids,
          group_id: c.instance.group_id,
          status: c.instance.status,
          title: c.instance.title,
          deleted: false,
        });
      }
    }
    // Ocorrências geradas: se o outro celular já criou, fica valendo a dele.
    this.s.upsert('task_instances', inserts, { ignoreDuplicates: true });
  }

  /** Garante que a semana atual e a próxima estão planejadas (cria só o que falta). */
  ensurePlanned(today = todayISO()) {
    const h = this.st.household;
    if (!h) return;
    const w = weekStart(today);
    for (const [week, from] of [[w, today], [addDays(w, 7), addDays(w, 7)]] as const) {
      const res = planWeek({
        week, fromDate: from, household: h, members: this.st.members, templates: this.st.templates,
        existing: this.st.instances, mode: 'generate', now: this.s.now, actorId: this.st.meId,
      });
      if (res.changes.length) this.applyPlan(res);
    }
  }

  /** Calcula uma nova distribuição para o resto da semana (não aplica). */
  previewReorganize(today = todayISO()): PlanResult | null {
    const h = this.st.household;
    if (!h) return null;
    const w = weekStart(today);
    // Domingo à noite faz mais sentido reorganizar a próxima semana também.
    const res = planWeek({
      week: w, fromDate: today, household: h, members: this.st.members, templates: this.st.templates,
      existing: this.st.instances, mode: 'reorganize', now: this.s.now, actorId: this.st.meId,
    });
    return res;
  }

  applyReorganize(res: PlanResult) {
    this.applyPlan(res);
    this.log('updated', 'plan', this.st.household!.id, 'Semana reorganizada', null, { changes: res.changes.length });
  }

  // ------------------------------------------------------------ sugestões (aprendizado)
  relaxTemplate(id: string) {
    const tpl = this.st.templates.find((t) => t.id === id);
    if (!tpl) return;
    this.saveTemplate({ ...tpl, recurrence: relaxedRecurrence(tpl) });
    this.dismiss(`postponed:${id}`);
  }

  reassignTemplate(id: string, memberId: string) {
    const tpl = this.st.templates.find((t) => t.id === id);
    if (!tpl) return;
    this.saveTemplate({ ...tpl, assign_mode: 'fixed', assignee_ids: [memberId] });
    this.dismiss(`postponed:${id}`);
  }

  updateEstimate(id: string, minutes: number) {
    const tpl = this.st.templates.find((t) => t.id === id);
    if (!tpl) return;
    this.saveTemplate({ ...tpl, minutes });
    this.dismiss(`estimate:${id}`);
  }

  dismiss(key: string) {
    if (!this.st.dismissed.includes(key)) this.s.setMeta({ dismissed: [...this.st.dismissed, key] });
  }

  // ------------------------------------------------------------ mercado
  addShopping(name: string, quantity: string | null = null, note: string | null = null) {
    const h = this.st.household;
    if (!h || !name.trim()) return;
    const now = this.s.now;
    const row: ShoppingItem = {
      id: randomId(), household_id: h.id, name: name.trim(), quantity: quantity?.trim() || null, note: note?.trim() || null,
      bought: false, bought_by: null, bought_at: null, added_by: this.st.meId, created_at: now, updated_at: now, deleted: false,
    };
    this.s.upsert('shopping_items', [row]);
    this.log('created', 'shopping', row.id, row.name, 'mercado');
  }

  toggleShopping(id: string) {
    const it = this.st.shopping.find((x) => x.id === id);
    if (!it) return;
    const bought = !it.bought;
    this.s.patch('shopping_items', id, { bought, bought_by: bought ? this.st.meId : null, bought_at: bought ? this.s.now : null });
    if (bought) this.log('completed', 'shopping', id, `${it.name} comprado`, 'mercado');
  }

  updateShopping(id: string, patch: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'note'>>) {
    this.s.patch('shopping_items', id, patch);
  }

  removeShopping(id: string) {
    this.s.patch('shopping_items', id, { deleted: true });
  }

  clearBought() {
    for (const it of this.st.shopping.filter((x) => x.bought && !x.deleted)) this.s.patch('shopping_items', it.id, { deleted: true });
  }

  // ------------------------------------------------------------ lição de casa
  addHomework(childId: string, activity: string, subject: string | null, due_date: string | null, note: string | null) {
    const h = this.st.household;
    if (!h || !activity.trim()) return;
    const now = this.s.now;
    const row: Homework = {
      id: randomId(), household_id: h.id, child_id: childId, activity: activity.trim(), subject: subject?.trim() || null,
      due_date, note: note?.trim() || null, done: false, done_at: null, created_by: this.st.meId, created_at: now, updated_at: now, deleted: false,
    };
    this.s.upsert('homework', [row]);
    this.log('created', 'homework', row.id, `Lição: ${row.activity}`, 'escola');
  }

  toggleHomework(id: string) {
    const hw = this.st.homework.find((x) => x.id === id);
    if (!hw) return;
    this.s.patch('homework', id, { done: !hw.done, done_at: hw.done ? null : this.s.now });
    if (!hw.done) this.log('completed', 'homework', id, `Lição: ${hw.activity}`, 'escola');
  }

  removeHomework(id: string) {
    this.s.patch('homework', id, { deleted: true });
  }

  // ------------------------------------------------------------ família
  addEvent(e: Omit<FamilyEvent, 'id' | 'household_id' | 'created_by' | 'created_at' | 'updated_at' | 'deleted' | 'done'>) {
    const h = this.st.household;
    if (!h) return;
    const now = this.s.now;
    const row: FamilyEvent = { ...e, id: randomId(), household_id: h.id, done: false, created_by: this.st.meId, created_at: now, updated_at: now, deleted: false };
    this.s.upsert('family_events', [row]);
    this.log('created', 'event', row.id, row.title, 'familia', { date: row.date });
  }

  toggleEvent(id: string) {
    const ev = this.st.events.find((x) => x.id === id);
    if (!ev) return;
    this.s.patch('family_events', id, { done: !ev.done });
    if (!ev.done) this.log('completed', 'event', id, ev.title, 'familia');
  }

  removeEvent(id: string) {
    this.s.patch('family_events', id, { deleted: true });
  }

  // ------------------------------------------------------------ configurações
  updateSettings(partial: Partial<HouseholdSettings>) {
    const h = this.st.household;
    if (!h) return;
    const settings = { ...h.settings, ...partial };
    this.s.patch('households', h.id, { settings });
  }

  updateMember(id: string, patch: Partial<Pick<Member, 'name' | 'emoji' | 'color' | 'schedule' | 'preferences' | 'age' | 'deleted'>>) {
    this.s.patch('members', id, patch);
    const m = this.st.members.find((x) => x.id === id);
    if (m) this.log('updated', 'member', id, m.name, null, { fields: Object.keys(patch) });
  }

  addChild(name: string, age: number | null) {
    const h = this.st.household;
    if (!h || !name.trim()) return;
    const now = this.s.now;
    const kids = this.st.members.filter((m) => m.kind === 'child');
    const row: Member = {
      id: randomId(), household_id: h.id, user_id: null, name: name.trim(), kind: 'child', role: 'child',
      color: ['#F2A93B', '#4FB286', '#8E6CD8', '#E0694F'][kids.length % 4], emoji: '🧒', schedule: null, preferences: {},
      age, sort: 10 + kids.length, created_at: now, updated_at: now, deleted: false,
    };
    this.s.upsert('members', [row]);
  }
}
