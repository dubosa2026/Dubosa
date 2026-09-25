// Interface com o servidor. Separada do Supabase para que a sincronização possa
// ser testada com um servidor falso (tests/sync.test.ts).
import type { SupabaseClient } from '@supabase/supabase-js';

export type TableName =
  | 'households'
  | 'members'
  | 'task_templates'
  | 'task_instances'
  | 'shopping_items'
  | 'homework'
  | 'family_events'
  | 'activity_log';

export const SYNC_TABLES: TableName[] = [
  'households', 'members', 'task_templates', 'task_instances', 'shopping_items', 'homework', 'family_events', 'activity_log',
];

export type Row = { id: string; updated_at?: string; household_id?: string } & Record<string, unknown>;

export interface RemoteError {
  message: string;
  /** true = problema de rede: manter na fila e tentar de novo. */
  retry: boolean;
}

export interface Remote {
  upsert(table: TableName, rows: Row[], ignoreDuplicates: boolean): Promise<RemoteError | null>;
  update(table: TableName, id: string, patch: Record<string, unknown>): Promise<RemoteError | null>;
  fetchSince(table: TableName, householdId: string, since: string | null): Promise<{ rows: Row[]; error: RemoteError | null }>;
  fetchIds(table: TableName, ids: string[]): Promise<{ rows: Row[]; error: RemoteError | null }>;
  subscribe(householdId: string, onRow: (table: TableName, row: Row) => void, onStatus: (ok: boolean) => void): () => void;
}

function toError(e: { message?: string; code?: string } | null | undefined): RemoteError | null {
  if (!e) return null;
  const msg = e.message ?? 'Erro desconhecido';
  const network = /fetch|network|timeout|timed out|connection|ECONN|offline|Failed to/i.test(msg) || !e.code;
  const auth = e.code === 'PGRST301' || /JWT/i.test(msg);
  return { message: msg, retry: network || auth };
}

export class SupabaseRemote implements Remote {
  constructor(private sb: SupabaseClient) {}

  async upsert(table: TableName, rows: Row[], ignoreDuplicates: boolean) {
    const { error } = await this.sb.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates });
    return toError(error);
  }

  async update(table: TableName, id: string, patch: Record<string, unknown>) {
    const { error } = await this.sb.from(table).update(patch).eq('id', id);
    return toError(error);
  }

  async fetchSince(table: TableName, householdId: string, since: string | null) {
    const rows: Row[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      let q = this.sb.from(table).select('*');
      q = table === 'households' ? q.eq('id', householdId) : q.eq('household_id', householdId);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q.order('updated_at', { ascending: true }).range(from, from + page - 1);
      if (error) return { rows, error: toError(error) };
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < page) break;
    }
    return { rows, error: null };
  }

  async fetchIds(table: TableName, ids: string[]) {
    if (!ids.length) return { rows: [], error: null };
    const rows: Row[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await this.sb.from(table).select('*').in('id', ids.slice(i, i + 200));
      if (error) return { rows, error: toError(error) };
      rows.push(...((data ?? []) as Row[]));
    }
    return { rows, error: null };
  }

  subscribe(householdId: string, onRow: (table: TableName, row: Row) => void, onStatus: (ok: boolean) => void) {
    let channel = this.sb.channel(`nossa-casa-${householdId}`);
    for (const table of SYNC_TABLES) {
      channel = channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, filter: table === 'households' ? `id=eq.${householdId}` : `household_id=eq.${householdId}` } as never,
        ((payload: { new?: Row }) => {
          if (payload.new && payload.new.id) onRow(table, payload.new);
        }) as never,
      );
    }
    channel.subscribe((status: string) => onStatus(status === 'SUBSCRIBED'));
    return () => {
      void this.sb.removeChannel(channel);
    };
  }
}
