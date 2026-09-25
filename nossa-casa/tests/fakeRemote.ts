// Servidor falso em memória que imita o Supabase: tabelas, upsert/update,
// carimbo de updated_at pelo servidor, "on conflict do nothing" e Realtime.
import type { Remote, RemoteError, Row, TableName } from '../src/data/remote';
import type { KV } from '../src/data/store';

export class FakeServer {
  tables = new Map<TableName, Map<string, Row>>();
  private clock = Date.parse('2026-09-21T10:00:00Z');
  private subs: { hid: string; fn: (t: TableName, r: Row) => void }[] = [];

  stamp() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  table(t: TableName) {
    if (!this.tables.has(t)) this.tables.set(t, new Map());
    return this.tables.get(t)!;
  }

  broadcast(t: TableName, r: Row) {
    const hid = t === 'households' ? r.id : (r.household_id as string);
    for (const s of this.subs) if (s.hid === hid) s.fn(t, { ...r });
  }

  subscribe(hid: string, fn: (t: TableName, r: Row) => void) {
    const s = { hid, fn };
    this.subs.push(s);
    return () => {
      this.subs = this.subs.filter((x) => x !== s);
    };
  }
}

export class FakeRemote implements Remote {
  online = true;
  realtime = true;
  constructor(public server: FakeServer) {}

  private off(): RemoteError | null {
    return this.online ? null : { message: 'Network request failed', retry: true };
  }

  async upsert(table: TableName, rows: Row[], ignoreDuplicates: boolean) {
    const e = this.off();
    if (e) return e;
    const t = this.server.table(table);
    for (const r of rows) {
      if (t.has(r.id) && ignoreDuplicates) continue;
      // Unicidade (template_id, occurrence), como no índice do banco.
      if (table === 'task_instances' && r.template_id && r.occurrence) {
        const dup = [...t.values()].find((x) => x.id !== r.id && x.template_id === r.template_id && x.occurrence === r.occurrence);
        if (dup) {
          if (ignoreDuplicates) continue;
          return { message: 'duplicate key value violates unique constraint', retry: false };
        }
      }
      const row = { ...(t.get(r.id) ?? {}), ...r, updated_at: this.server.stamp() };
      t.set(r.id, row);
      this.server.broadcast(table, row);
    }
    return null;
  }

  async update(table: TableName, id: string, patch: Record<string, unknown>) {
    const e = this.off();
    if (e) return e;
    const t = this.server.table(table);
    const cur = t.get(id);
    if (!cur) return null; // como o PostgREST: update em linha inexistente não é erro
    const row = { ...cur, ...patch, updated_at: this.server.stamp() };
    t.set(id, row);
    this.server.broadcast(table, row);
    return null;
  }

  async fetchSince(table: TableName, hid: string, since: string | null) {
    const e = this.off();
    if (e) return { rows: [], error: e };
    const rows = [...this.server.table(table).values()]
      .filter((r) => (table === 'households' ? r.id === hid : r.household_id === hid))
      .filter((r) => !since || (r.updated_at as string) > since)
      .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
    return { rows: rows.map((r) => ({ ...r })), error: null };
  }

  async fetchIds(table: TableName, ids: string[]) {
    const e = this.off();
    if (e) return { rows: [], error: e };
    const t = this.server.table(table);
    return { rows: ids.map((id) => t.get(id)).filter(Boolean).map((r) => ({ ...r! })), error: null };
  }

  subscribe(hid: string, onRow: (t: TableName, r: Row) => void, onStatus: (ok: boolean) => void) {
    onStatus(true);
    return this.server.subscribe(hid, (t, r) => {
      if (this.online && this.realtime) onRow(t, r);
    });
  }
}

export class MemoryKV implements KV {
  data = new Map<string, string>();
  async get(k: string) {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.data.set(k, v);
  }
  async remove(k: string) {
    this.data.delete(k);
  }
}
