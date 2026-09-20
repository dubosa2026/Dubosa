import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ActionOrigin, IntegratorAction, IntegratorActionType } from "../../types";

interface IntegratorActionRow {
  id: string;
  user_id: string;
  cliente: string;
  tipo: IntegratorActionType;
  origem: ActionOrigin;
  criado_em: string;
}

function toIntegratorAction(row: IntegratorActionRow): IntegratorAction {
  return {
    id: row.id,
    userId: row.user_id,
    cliente: row.cliente,
    tipo: row.tipo,
    origem: row.origem,
    criadoEm: row.criado_em,
  };
}

export class IntegratorActionRepository {
  constructor(private readonly db: Database) {}

  registrar(dados: { userId: string; cliente: string; tipo: IntegratorActionType; origem: ActionOrigin }): IntegratorAction {
    const id = randomUUID();
    const criadoEm = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO integrator_actions (id, user_id, cliente, tipo, origem, criado_em) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, dados.userId, dados.cliente, dados.tipo, dados.origem, criadoEm);
    return { id, userId: dados.userId, cliente: dados.cliente, tipo: dados.tipo, origem: dados.origem, criadoEm };
  }

  listarPorUsuario(userId: string): IntegratorAction[] {
    const rows = this.db
      .prepare("SELECT * FROM integrator_actions WHERE user_id = ? ORDER BY criado_em DESC")
      .all(userId) as IntegratorActionRow[];
    return rows.map(toIntegratorAction);
  }

  listarTodas(): IntegratorAction[] {
    const rows = this.db.prepare("SELECT * FROM integrator_actions ORDER BY criado_em DESC").all() as IntegratorActionRow[];
    return rows.map(toIntegratorAction);
  }

  listarNoPeriodo(inicioISO: string, fimISO: string): IntegratorAction[] {
    const rows = this.db
      .prepare("SELECT * FROM integrator_actions WHERE criado_em >= ? AND criado_em < ? ORDER BY criado_em")
      .all(inicioISO, fimISO) as IntegratorActionRow[];
    return rows.map(toIntegratorAction);
  }
}
