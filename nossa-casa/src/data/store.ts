// Estado do aplicativo, "offline primeiro".
//
// Toda alteração:
//   1) é aplicada na hora no celular (a tela responde sem esperar a internet);
//   2) vai para uma fila (outbox) guardada no aparelho;
//   3) a fila é enviada ao Supabase assim que houver conexão;
//   4) o outro celular recebe a mudança em tempo real (Realtime) ou na próxima sincronização.
// Conflitos: cada alteração envia só os campos mudados (patch), então Eduardo
// concluir uma tarefa enquanto Jussara muda o título não perde nada.
import { nowISO, weekStart } from '../domain/dates';
import type {
  ActivityLog, FamilyEvent, Homework, Household, Member, ShoppingItem, Snapshot, TaskInstance, TaskTemplate,
} from '../domain/types';
import { SYNC_TABLES, type Remote, type Row, type TableName } from './remote';

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type NewOp =
  | { kind: 'upsert'; table: TableName; row: Row; ignoreDuplicates: boolean }
  | { kind: 'patch'; table: TableName; id: string; patch: Record<string, unknown> };
export type OutboxOp = NewOp & { seq: number };

export interface SyncState {
  online: boolean;
  realtime: boolean;
  pending: number;
  lastSync: string | null;
  error: string | null;
  syncing: boolean;
}

export interface State extends Snapshot {
  ready: boolean;
  meId: string | null;
  sync: SyncState;
  dismissed: string[];
}

type ListKey = 'members' | 'templates' | 'instances' | 'shopping' | 'homework' | 'events' | 'logs';

export const TABLE_KEY: Record<Exclude<TableName, 'households'>, ListKey> = {
  members: 'members',
  task_templates: 'templates',
  task_instances: 'instances',
  shopping_items: 'shopping',
  homework: 'homework',
  family_events: 'events',
  activity_log: 'logs',
};

const emptyState = (): State => ({
  household: null,
  members: [],
  templates: [],
  instances: [],
  shopping: [],
  homework: [],
  events: [],
  logs: [],
  ready: false,
  meId: null,
  sync: { online: true, realtime: false, pending: 0, lastSync: null, error: null, syncing: false },
  dismissed: [],
});

/** Mantém no celular só os últimos ~2 meses (o histórico completo continua no servidor). */
const KEEP_DAYS = 70;

export interface StoreOptions {
  kv: KV;
  namespace: string; // separa dados de modos/contas diferentes
  remote?: Remote | null;
  onRemoteChange?: (table: TableName, row: Row, previous: Row | undefined) => void;
  now?: () => string;
}

export class Store {
  state: State = emptyState();
  private listeners = new Set<() => void>();
  private outbox: OutboxOp[] = [];
  private seq = 0;
  private cursors: Partial<Record<TableName, string>> = {};
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Último conteúdo gravado de cada semana (evita regravar o que não mudou). */
  private written = new Map<string, string>();
  private flushing: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly remote: Remote | null;
  private opts: StoreOptions;

  constructor(opts: StoreOptions) {
    this.opts = opts;
    this.remote = opts.remote ?? null;
  }

  get now() {
    return this.opts.now ? this.opts.now() : nowISO();
  }

  // --------------------------------------------------------------- assinatura
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private emit() {
    for (const l of this.listeners) l();
  }

  set(partial: Partial<State>) {
    this.state = { ...this.state, ...partial };
    this.emit();
    this.scheduleSave();
  }

  // --------------------------------------------------------------- persistência
  private k(name: string) {
    return `nc:${this.opts.namespace}:${name}`;
  }

  async load() {
    const [snap, outbox, cursors, meta] = await Promise.all([
      this.opts.kv.get(this.k('snapshot')),
      this.opts.kv.get(this.k('outbox')),
      this.opts.kv.get(this.k('cursors')),
      this.opts.kv.get(this.k('meta')),
    ]);
    const base = emptyState();
    if (snap) Object.assign(base, JSON.parse(snap) as Snapshot);
    // As tarefas ficam em pedaços por semana (o Android limita cada item do armazenamento a ~2 MB).
    const index = await this.opts.kv.get(this.k('instances:index'));
    if (index) {
      const weeks = JSON.parse(index) as string[];
      const chunks = await Promise.all(weeks.map((w) => this.opts.kv.get(this.k(`instances:${w}`))));
      base.instances = chunks.flatMap((c) => (c ? (JSON.parse(c) as TaskInstance[]) : []));
      weeks.forEach((w, i) => this.written.set(w, chunks[i] ?? ''));
    }
    if (meta) {
      const m = JSON.parse(meta) as { meId: string | null; dismissed: string[]; lastSync: string | null };
      base.meId = m.meId;
      base.dismissed = m.dismissed ?? [];
      base.sync.lastSync = m.lastSync ?? null;
    }
    this.outbox = outbox ? (JSON.parse(outbox) as OutboxOp[]) : [];
    this.seq = this.outbox.reduce((s, o) => Math.max(s, o.seq), 0);
    this.cursors = cursors ? JSON.parse(cursors) : {};
    base.sync.pending = this.outbox.length;
    base.ready = true;
    this.state = base;
    this.emit();
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, 400);
  }

  async saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const s = this.state;
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    const snap: Omit<Snapshot, 'instances'> = {
      household: s.household,
      members: s.members,
      templates: s.templates,
      shopping: s.shopping.filter((x) => !x.deleted),
      homework: s.homework,
      events: s.events,
      logs: s.logs.slice(0, 1000),
    };
    const byWeek = new Map<string, TaskInstance[]>();
    for (const i of s.instances) {
      if (i.date < cutoff) continue;
      const w = weekStart(i.date);
      byWeek.set(w, [...(byWeek.get(w) ?? []), i]);
    }
    const writes: Promise<void>[] = [];
    for (const [w, list] of byWeek) {
      const json = JSON.stringify(list);
      if (this.written.get(w) === json) continue;
      this.written.set(w, json);
      writes.push(this.opts.kv.set(this.k(`instances:${w}`), json));
    }
    for (const w of [...this.written.keys()]) {
      if (!byWeek.has(w)) {
        this.written.delete(w);
        writes.push(this.opts.kv.remove(this.k(`instances:${w}`)));
      }
    }
    await Promise.all([
      ...writes,
      this.opts.kv.set(this.k('instances:index'), JSON.stringify([...byWeek.keys()])),
      this.opts.kv.set(this.k('snapshot'), JSON.stringify(snap)),
      this.opts.kv.set(this.k('outbox'), JSON.stringify(this.outbox)),
      this.opts.kv.set(this.k('cursors'), JSON.stringify(this.cursors)),
      this.opts.kv.set(this.k('meta'), JSON.stringify({ meId: s.meId, dismissed: s.dismissed, lastSync: s.sync.lastSync })),
    ]);
  }

  async clear() {
    const chunks = [...this.written.keys()].map((w) => `instances:${w}`);
    await Promise.all(['snapshot', 'outbox', 'cursors', 'meta', 'instances:index', ...chunks].map((n) => this.opts.kv.remove(this.k(n))));
    this.written.clear();
    this.outbox = [];
    this.cursors = {};
    this.state = { ...emptyState(), ready: true };
    this.emit();
  }

  // --------------------------------------------------------------- escrita local
  private applyRow(table: TableName, row: Row) {
    if (table === 'households') {
      this.state = { ...this.state, household: row as unknown as Household };
      return;
    }
    const key = TABLE_KEY[table];
    const list = this.state[key] as unknown as Row[];
    const idx = list.findIndex((r) => r.id === row.id);
    const next = idx >= 0 ? list.map((r, i) => (i === idx ? row : r)) : [row, ...list];
    this.state = { ...this.state, [key]: next };
  }

  getRow(table: TableName, id: string): Row | undefined {
    if (table === 'households') return this.state.household?.id === id ? (this.state.household as unknown as Row) : undefined;
    return (this.state[TABLE_KEY[table]] as unknown as Row[]).find((r) => r.id === id);
  }

  private enqueue(op: NewOp) {
    if (!this.remote) return;
    // Junta alterações seguidas da mesma linha para economizar requisições.
    if (op.kind === 'patch') {
      const last = [...this.outbox].reverse().find((o) => (o.kind === 'patch' ? o.id : o.row.id) === op.id && o.table === op.table);
      if (last && last === this.outbox[this.outbox.length - 1]) {
        if (last.kind === 'patch') last.patch = { ...last.patch, ...op.patch };
        else if (!last.ignoreDuplicates) last.row = { ...last.row, ...op.patch };
        else this.outbox.push({ ...op, seq: ++this.seq });
        this.updatePending();
        return;
      }
    }
    this.outbox.push({ ...op, seq: ++this.seq });
    this.updatePending();
  }

  private updatePending() {
    this.state = { ...this.state, sync: { ...this.state.sync, pending: this.outbox.length } };
  }

  /** Insere ou substitui linhas inteiras (novos registros). */
  upsert<T extends { id: string }>(table: TableName, rows: T[], opts: { ignoreDuplicates?: boolean } = {}) {
    if (!rows.length) return;
    const now = this.now;
    for (const r of rows) {
      const row = { ...(r as unknown as Row), updated_at: now };
      this.applyRow(table, row);
      this.enqueue({ kind: 'upsert', table, row, ignoreDuplicates: !!opts.ignoreDuplicates });
    }
    this.emit();
    this.scheduleSave();
    this.kick();
  }

  /** Altera só alguns campos de uma linha. */
  patch(table: TableName, id: string, patch: Record<string, unknown>) {
    const cur = this.getRow(table, id);
    if (!cur) return;
    const now = this.now;
    this.applyRow(table, { ...cur, ...patch, updated_at: now });
    this.enqueue({ kind: 'patch', table, id, patch: { ...patch } });
    this.emit();
    this.scheduleSave();
    this.kick();
  }

  setMeta(partial: Partial<Pick<State, 'meId' | 'dismissed'>>) {
    this.set(partial);
  }

  // --------------------------------------------------------------- sincronização
  private kickTimer: ReturnType<typeof setTimeout> | null = null;
  private kick() {
    if (!this.remote || !this.state.sync.online) return;
    if (this.kickTimer) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.flush();
    }, 50);
  }

  setOnline(online: boolean) {
    const was = this.state.sync.online;
    this.state = { ...this.state, sync: { ...this.state.sync, online } };
    this.emit();
    if (online && !was) void this.syncNow();
  }

  /** Envia a fila para o servidor, em ordem. */
  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      // Garante que o `finally` rode depois da atribuição de this.flushing.
      await Promise.resolve();
      const inserted: Partial<Record<TableName, string[]>> = {};
      try {
        while (this.outbox.length && this.state.sync.online) {
          // Agrupa upserts consecutivos da mesma tabela.
          const head = this.outbox[0];
          let batch: OutboxOp[] = [head];
          if (head.kind === 'upsert') {
            batch = [];
            for (const o of this.outbox) {
              if (o.kind !== 'upsert' || o.table !== head.table || o.ignoreDuplicates !== head.ignoreDuplicates || batch.length >= 200) break;
              if (batch.some((b) => b.kind === 'upsert' && b.row.id === o.row.id)) break;
              batch.push(o);
            }
          }
          const err = head.kind === 'upsert'
            ? await this.remote!.upsert(head.table, batch.map((b) => (b as Extract<OutboxOp, { kind: 'upsert' }>).row), head.ignoreDuplicates)
            : await this.remote!.update(head.table, head.id, head.patch);
          if (err?.retry) {
            this.state = { ...this.state, sync: { ...this.state.sync, error: err.message } };
            this.emit();
            break;
          }
          if (err) {
            // Erro definitivo (ex.: regra do banco): descarta para não travar a fila, mas avisa.
            this.state = { ...this.state, sync: { ...this.state.sync, error: `Uma alteração foi recusada pelo servidor: ${err.message}` } };
          } else if (head.kind === 'upsert' && head.ignoreDuplicates) {
            (inserted[head.table] ??= []).push(...batch.map((b) => (b as Extract<OutboxOp, { kind: 'upsert' }>).row.id));
          }
          const done = new Set(batch.map((b) => b.seq));
          this.outbox = this.outbox.filter((o) => !done.has(o.seq));
          this.updatePending();
          this.emit();
        }
        // Linhas geradas nos dois celulares: o servidor fica com a primeira; buscamos a versão oficial.
        for (const [table, ids] of Object.entries(inserted) as [TableName, string[]][]) {
          const { rows } = await this.remote!.fetchIds(table, ids);
          for (const r of rows) this.mergeRemote(table, r, false);
        }
        if (!this.outbox.length && this.state.sync.error && !this.state.sync.error.startsWith('Uma alteração')) {
          this.state = { ...this.state, sync: { ...this.state.sync, error: null } };
        }
      } finally {
        this.flushing = null;
        this.emit();
        this.scheduleSave();
      }
    })();
    return this.flushing;
  }

  /** Aplica uma linha vinda do servidor, preservando alterações locais ainda não enviadas. */
  mergeRemote(table: TableName, row: Row, notify = true) {
    const prev = this.getRow(table, row.id);
    let merged: Row = { ...row };
    for (const o of this.outbox) {
      if (o.table !== table) continue;
      if (o.kind === 'patch' && o.id === row.id) merged = { ...merged, ...o.patch };
      if (o.kind === 'upsert' && o.row.id === row.id && !o.ignoreDuplicates) merged = { ...merged, ...o.row };
    }
    this.applyRow(table, merged);
    if (notify && this.opts.onRemoteChange) this.opts.onRemoteChange(table, row, prev);
  }

  /** Busca no servidor tudo o que mudou desde a última vez. */
  async pull(): Promise<boolean> {
    const hid = this.state.household?.id;
    if (!this.remote || !hid) return false;
    for (const table of SYNC_TABLES) {
      const cur = this.cursors[table];
      // Volta 2 minutos para não perder transações que terminaram fora de ordem.
      const since = cur ? new Date(Date.parse(cur) - 120000).toISOString() : null;
      const { rows, error } = await this.remote.fetchSince(table, hid, since);
      if (error) {
        this.state = { ...this.state, sync: { ...this.state.sync, error: error.message } };
        this.emit();
        return false;
      }
      for (const r of rows) {
        const local = this.getRow(table, r.id);
        if (local && local.updated_at === r.updated_at) continue;
        this.mergeRemote(table, r, !!cur);
        if (r.updated_at && (!this.cursors[table] || r.updated_at > this.cursors[table]!)) this.cursors[table] = r.updated_at;
      }
    }
    this.state = { ...this.state, sync: { ...this.state.sync, lastSync: this.now } };
    this.emit();
    this.scheduleSave();
    return true;
  }

  async syncNow() {
    if (!this.remote || !this.state.household) return;
    this.state = { ...this.state, sync: { ...this.state.sync, syncing: true } };
    this.emit();
    try {
      await this.flush();
      await this.pull();
      await this.flush();
    } finally {
      this.state = { ...this.state, sync: { ...this.state.sync, syncing: false } };
      this.emit();
    }
  }

  startRealtime() {
    const hid = this.state.household?.id;
    if (!this.remote || !hid || this.unsubscribe) return;
    this.unsubscribe = this.remote.subscribe(
      hid,
      (table, row) => {
        this.mergeRemote(table, row, true);
        if (row.updated_at && (!this.cursors[table] || row.updated_at > this.cursors[table]!)) this.cursors[table] = row.updated_at;
        this.emit();
        this.scheduleSave();
      },
      (ok) => {
        this.state = { ...this.state, sync: { ...this.state.sync, realtime: ok } };
        this.emit();
      },
    );
  }

  stopRealtime() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  pendingOps() {
    return this.outbox.length;
  }

  /** Recebe a casa completa (após criar/entrar), sem colocar na fila. */
  hydrate(snap: Partial<Snapshot>) {
    this.state = { ...this.state, ...snap };
    this.emit();
    this.scheduleSave();
  }
}

export type { ActivityLog, FamilyEvent, Homework, Member, ShoppingItem, TaskInstance, TaskTemplate };
