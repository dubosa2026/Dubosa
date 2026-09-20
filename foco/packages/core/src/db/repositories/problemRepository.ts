import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { nextCounterValue } from "../database";
import { formatProtocolo } from "../../protocol";
import type { Priority, Problem, ProblemCategory, ProblemStatus } from "../../types";

interface ProblemRow {
  id: string;
  protocolo: string;
  user_id: string;
  cliente: string;
  descricao: string;
  categoria: ProblemCategory;
  prioridade: Priority;
  area_responsavel: string;
  status: ProblemStatus;
  preso: number;
  criado_em: string;
  atualizado_em: string;
}

function toProblem(row: ProblemRow): Problem {
  return {
    id: row.id,
    protocolo: row.protocolo,
    userId: row.user_id,
    cliente: row.cliente,
    descricao: row.descricao,
    categoria: row.categoria,
    prioridade: row.prioridade,
    areaResponsavel: row.area_responsavel,
    status: row.status,
    preso: row.preso === 1,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export interface RegistrarProblemaInput {
  userId: string;
  cliente: string;
  descricao: string;
  categoria: ProblemCategory;
  prioridade: Priority;
  areaResponsavel: string;
}

export class ProblemRepository {
  constructor(private readonly db: Database) {}

  registrar(input: RegistrarProblemaInput): Problem {
    const id = randomUUID();
    const agora = new Date().toISOString();
    const protocolo = formatProtocolo(nextCounterValue(this.db, "protocolo"));
    this.db
      .prepare(
        `INSERT INTO problems
           (id, protocolo, user_id, cliente, descricao, categoria, prioridade, area_responsavel, status, preso, criado_em, atualizado_em)
         VALUES (@id, @protocolo, @userId, @cliente, @descricao, @categoria, @prioridade, @areaResponsavel, 'ABERTO', 0, @agora, @agora)`
      )
      .run({ id, protocolo, agora, ...input });
    return this.buscarPorId(id)!;
  }

  buscarPorId(id: string): Problem | null {
    const row = this.db.prepare("SELECT * FROM problems WHERE id = ?").get(id) as ProblemRow | undefined;
    return row ? toProblem(row) : null;
  }

  marcarPreso(id: string): Problem {
    const agora = new Date().toISOString();
    this.db.prepare("UPDATE problems SET preso = 1, atualizado_em = ? WHERE id = ?").run(agora, id);
    return this.buscarPorId(id)!;
  }

  atualizarStatus(id: string, status: ProblemStatus): Problem {
    const agora = new Date().toISOString();
    this.db.prepare("UPDATE problems SET status = ?, atualizado_em = ? WHERE id = ?").run(status, agora, id);
    return this.buscarPorId(id)!;
  }

  listarPorUsuario(userId: string): Problem[] {
    const rows = this.db
      .prepare("SELECT * FROM problems WHERE user_id = ? ORDER BY criado_em DESC")
      .all(userId) as ProblemRow[];
    return rows.map(toProblem);
  }

  listarNoPeriodo(inicioISO: string, fimISO: string): Problem[] {
    const rows = this.db
      .prepare("SELECT * FROM problems WHERE criado_em >= ? AND criado_em < ? ORDER BY criado_em DESC")
      .all(inicioISO, fimISO) as ProblemRow[];
    return rows.map(toProblem);
  }

  listarTodos(): Problem[] {
    const rows = this.db.prepare("SELECT * FROM problems ORDER BY criado_em DESC").all() as ProblemRow[];
    return rows.map(toProblem);
  }

  listarPresos(): Problem[] {
    const rows = this.db
      .prepare("SELECT * FROM problems WHERE preso = 1 AND status != 'RESOLVIDO' ORDER BY criado_em")
      .all() as ProblemRow[];
    return rows.map(toProblem);
  }
}
