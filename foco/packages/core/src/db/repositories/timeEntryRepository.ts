import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { TimeCategory, TimeEntry } from "../../types";

interface TimeEntryRow {
  id: string;
  user_id: string;
  categoria: TimeCategory;
  inicio: string;
  fim: string | null;
  problema_id: string | null;
}

function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    userId: row.user_id,
    categoria: row.categoria,
    inicio: row.inicio,
    fim: row.fim,
    problemaId: row.problema_id,
  };
}

export class TimeEntryRepository {
  constructor(private readonly db: Database) {}

  /** Inicia um novo registro de tempo. Falha se já houver um em andamento para o usuário. */
  iniciar(userId: string, categoria: TimeCategory, problemaId?: string | null): TimeEntry {
    const emAndamento = this.buscarEmAndamento(userId);
    if (emAndamento) {
      throw new Error(
        `Usuário já tem um registro de tempo em andamento (categoria ${emAndamento.categoria}). Pare-o antes de iniciar outro.`
      );
    }
    const id = randomUUID();
    const inicio = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO time_entries (id, user_id, categoria, inicio, fim, problema_id) VALUES (?, ?, ?, ?, NULL, ?)"
      )
      .run(id, userId, categoria, inicio, problemaId ?? null);
    return { id, userId, categoria, inicio, fim: null, problemaId: problemaId ?? null };
  }

  parar(id: string): TimeEntry {
    const fim = new Date().toISOString();
    this.db.prepare("UPDATE time_entries SET fim = ? WHERE id = ?").run(fim, id);
    const row = this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as TimeEntryRow;
    return toTimeEntry(row);
  }

  buscarEmAndamento(userId: string): TimeEntry | null {
    const row = this.db
      .prepare("SELECT * FROM time_entries WHERE user_id = ? AND fim IS NULL ORDER BY inicio DESC LIMIT 1")
      .get(userId) as TimeEntryRow | undefined;
    return row ? toTimeEntry(row) : null;
  }

  listarPorUsuarioNoPeriodo(userId: string, inicioISO: string, fimISO: string): TimeEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM time_entries
         WHERE user_id = ? AND inicio >= ? AND inicio < ?
         ORDER BY inicio`
      )
      .all(userId, inicioISO, fimISO) as TimeEntryRow[];
    return rows.map(toTimeEntry);
  }

  listarNoPeriodo(inicioISO: string, fimISO: string): TimeEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM time_entries
         WHERE inicio >= ? AND inicio < ?
         ORDER BY inicio`
      )
      .all(inicioISO, fimISO) as TimeEntryRow[];
    return rows.map(toTimeEntry);
  }
}
