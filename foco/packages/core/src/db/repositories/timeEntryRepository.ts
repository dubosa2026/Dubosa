import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { AlteracaoRegistro, CategoriaTempo, RegistroTempo } from "../../types";

interface RegistroRow {
  id: string;
  user_id: string;
  categoria: CategoriaTempo;
  inicio: string;
  fim: string | null;
  problema_id: string | null;
  alteracoes: string;
}

function toRegistro(row: RegistroRow): RegistroTempo {
  return {
    id: row.id,
    userId: row.user_id,
    categoria: row.categoria,
    inicio: row.inicio,
    fim: row.fim,
    problemaId: row.problema_id,
    alteracoes: JSON.parse(row.alteracoes) as AlteracaoRegistro[],
  };
}

/**
 * Registros do cronômetro — autodeclaração de atividade. Toda alteração de
 * categoria fica registrada: o gerente precisa saber que um bloco foi
 * reclassificado, senão o histórico vira ficção.
 */
export class TimeEntryRepository {
  constructor(private readonly db: Database) {}

  iniciar(userId: string, categoria: CategoriaTempo, problemaId?: string | null): RegistroTempo {
    const emAndamento = this.buscarEmAndamento(userId);
    if (emAndamento) {
      throw new Error(
        `Já existe um bloco em andamento (${emAndamento.categoria}). Pare-o antes de iniciar outro.`
      );
    }
    const id = randomUUID();
    const inicio = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO time_entries (id, user_id, categoria, inicio, fim, problema_id, alteracoes) VALUES (?, ?, ?, ?, NULL, ?, '[]')"
      )
      .run(id, userId, categoria, inicio, problemaId ?? null);
    return { id, userId, categoria, inicio, fim: null, problemaId: problemaId ?? null, alteracoes: [] };
  }

  parar(id: string): RegistroTempo {
    this.db.prepare("UPDATE time_entries SET fim = ? WHERE id = ?").run(new Date().toISOString(), id);
    return toRegistro(this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as RegistroRow);
  }

  /** Troca a categoria de um bloco, guardando a alteração para auditoria. */
  alterarCategoria(id: string, novaCategoria: CategoriaTempo): RegistroTempo {
    const row = this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as RegistroRow | undefined;
    if (!row) throw new Error(`Registro ${id} não encontrado.`);
    const alteracoes = JSON.parse(row.alteracoes) as AlteracaoRegistro[];
    alteracoes.push({ em: new Date().toISOString(), de: row.categoria, para: novaCategoria });
    this.db
      .prepare("UPDATE time_entries SET categoria = ?, alteracoes = ? WHERE id = ?")
      .run(novaCategoria, JSON.stringify(alteracoes), id);
    return toRegistro(this.db.prepare("SELECT * FROM time_entries WHERE id = ?").get(id) as RegistroRow);
  }

  buscarEmAndamento(userId: string): RegistroTempo | null {
    const row = this.db
      .prepare("SELECT * FROM time_entries WHERE user_id = ? AND fim IS NULL ORDER BY inicio DESC LIMIT 1")
      .get(userId) as RegistroRow | undefined;
    return row ? toRegistro(row) : null;
  }

  listarPorUsuarioNoPeriodo(userId: string, inicioISO: string, fimISO: string): RegistroTempo[] {
    const rows = this.db
      .prepare("SELECT * FROM time_entries WHERE user_id = ? AND inicio >= ? AND inicio < ? ORDER BY inicio")
      .all(userId, inicioISO, fimISO) as RegistroRow[];
    return rows.map(toRegistro);
  }

  listarNoPeriodo(inicioISO: string, fimISO: string): RegistroTempo[] {
    const rows = this.db
      .prepare("SELECT * FROM time_entries WHERE inicio >= ? AND inicio < ? ORDER BY inicio")
      .all(inicioISO, fimISO) as RegistroRow[];
    return rows.map(toRegistro);
  }

  listarPorProblema(problemaId: string): RegistroTempo[] {
    const rows = this.db
      .prepare("SELECT * FROM time_entries WHERE problema_id = ? ORDER BY inicio")
      .all(problemaId) as RegistroRow[];
    return rows.map(toRegistro);
  }
}
