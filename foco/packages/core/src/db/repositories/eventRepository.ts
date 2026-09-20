import type { Database } from "better-sqlite3";
import type { CategoriaProblema, EventoIdentificado, FonteEvento, Relevancia } from "../../types";

interface EventoRow {
  id: string;
  user_id: string;
  fonte: FonteEvento;
  ocorrido_em: string;
  assunto: string;
  categoria: CategoriaProblema;
  relevancia: Relevancia;
  cliente: string | null;
  problema_id: string | null;
}

function toEvento(row: EventoRow): EventoIdentificado {
  return {
    id: row.id,
    userId: row.user_id,
    fonte: row.fonte,
    ocorridoEm: row.ocorrido_em,
    assunto: row.assunto,
    categoria: row.categoria,
    relevancia: row.relevancia,
    cliente: row.cliente,
    problemaId: row.problema_id,
  };
}

/**
 * Eventos identificados pelas integrações. O id vem do conector
 * (`email:<id>`, `whatsapp:<id>`), então reprocessar a mesma caixa não
 * duplica nada — importante porque o agente local roda repetidamente.
 */
export class EventRepository {
  constructor(private readonly db: Database) {}

  registrarVarios(eventos: EventoIdentificado[]): number {
    const stmt = this.db.prepare(
      `INSERT INTO identified_events (id, user_id, fonte, ocorrido_em, assunto, categoria, relevancia, cliente, problema_id)
       VALUES (@id, @userId, @fonte, @ocorridoEm, @assunto, @categoria, @relevancia, @cliente, @problemaId)
       ON CONFLICT(id) DO NOTHING`
    );
    const tx = this.db.transaction((lista: EventoIdentificado[]) => {
      let inseridos = 0;
      for (const e of lista) {
        const r = stmt.run({
          id: e.id,
          userId: e.userId,
          fonte: e.fonte,
          ocorridoEm: e.ocorridoEm,
          assunto: e.assunto,
          categoria: e.categoria,
          relevancia: e.relevancia,
          cliente: e.cliente ?? null,
          problemaId: e.problemaId ?? null,
        });
        inseridos += r.changes;
      }
      return inseridos;
    });
    return tx(eventos);
  }

  listarPorUsuarioNoPeriodo(userId: string, inicioISO: string, fimISO: string): EventoIdentificado[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM identified_events WHERE user_id = ? AND ocorrido_em >= ? AND ocorrido_em < ? ORDER BY ocorrido_em"
      )
      .all(userId, inicioISO, fimISO) as EventoRow[];
    return rows.map(toEvento);
  }

  listarNoPeriodo(inicioISO: string, fimISO: string): EventoIdentificado[] {
    const rows = this.db
      .prepare("SELECT * FROM identified_events WHERE ocorrido_em >= ? AND ocorrido_em < ? ORDER BY ocorrido_em")
      .all(inicioISO, fimISO) as EventoRow[];
    return rows.map(toEvento);
  }

  vincularAoProblema(eventoId: string, problemaId: string): void {
    this.db.prepare("UPDATE identified_events SET problema_id = ? WHERE id = ?").run(problemaId, eventoId);
  }
}
