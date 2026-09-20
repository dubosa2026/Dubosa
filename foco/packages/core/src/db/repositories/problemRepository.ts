import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { nextCounterValue } from "../database";
import { formatProtocolo } from "../../protocol";
import { moverStatus } from "../../problems";
import type {
  CategoriaProblema,
  EventoProblema,
  OrigemProblema,
  PedidoAjuda,
  Prioridade,
  Problema,
  StatusProblema,
} from "../../types";

interface ProblemaRow {
  id: string;
  protocolo: string;
  user_id: string;
  cliente: string | null;
  descricao: string;
  categoria: CategoriaProblema;
  prioridade: Prioridade;
  area_responsavel: string;
  responsavel: string | null;
  status: StatusProblema;
  origem: OrigemProblema;
  preso: number;
  pedido_ajuda: string | null;
  criado_em: string;
  atualizado_em: string;
  resolvido_em: string | null;
  historico: string;
}

function toProblema(row: ProblemaRow): Problema {
  return {
    id: row.id,
    protocolo: row.protocolo,
    userId: row.user_id,
    cliente: row.cliente,
    descricao: row.descricao,
    categoria: row.categoria,
    prioridade: row.prioridade,
    areaResponsavel: row.area_responsavel,
    responsavel: row.responsavel,
    status: row.status,
    origem: row.origem,
    preso: row.preso === 1,
    pedidoAjuda: row.pedido_ajuda ? (JSON.parse(row.pedido_ajuda) as PedidoAjuda) : null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    resolvidoEm: row.resolvido_em,
    historico: JSON.parse(row.historico) as EventoProblema[],
  };
}

export interface RegistrarProblemaInput {
  userId: string;
  cliente?: string | null;
  descricao: string;
  categoria: CategoriaProblema;
  prioridade: Prioridade;
  areaResponsavel: string;
  origem?: OrigemProblema;
}

export class ProblemRepository {
  constructor(private readonly db: Database) {}

  registrar(input: RegistrarProblemaInput): Problema {
    const id = randomUUID();
    const agora = new Date().toISOString();
    const protocolo = formatProtocolo(nextCounterValue(this.db, "protocolo"));
    const origem = input.origem ?? "REGISTRO_VENDEDOR";
    const historico: EventoProblema[] = [
      { em: agora, status: "NOVO", por: origem === "REGISTRO_VENDEDOR" ? "vendedor" : "sistema" },
    ];

    this.db
      .prepare(
        `INSERT INTO problems
           (id, protocolo, user_id, cliente, descricao, categoria, prioridade, area_responsavel,
            responsavel, status, origem, preso, pedido_ajuda, criado_em, atualizado_em, resolvido_em, historico)
         VALUES (@id, @protocolo, @userId, @cliente, @descricao, @categoria, @prioridade, @areaResponsavel,
                 NULL, 'NOVO', @origem, 0, NULL, @agora, @agora, NULL, @historico)`
      )
      .run({
        id,
        protocolo,
        agora,
        origem,
        historico: JSON.stringify(historico),
        userId: input.userId,
        cliente: input.cliente ?? null,
        descricao: input.descricao,
        categoria: input.categoria,
        prioridade: input.prioridade,
        areaResponsavel: input.areaResponsavel,
      });
    return this.buscarPorId(id)!;
  }

  buscarPorId(id: string): Problema | null {
    const row = this.db.prepare("SELECT * FROM problems WHERE id = ?").get(id) as ProblemaRow | undefined;
    return row ? toProblema(row) : null;
  }

  /** Move o status validando a transição no domínio antes de persistir. */
  mover(id: string, novoStatus: StatusProblema, por: string, nota?: string): Problema {
    const atual = this.buscarPorId(id);
    if (!atual) throw new Error(`Problema ${id} não encontrado.`);
    const movido = moverStatus(atual, novoStatus, por, nota);
    this.db
      .prepare(
        "UPDATE problems SET status = ?, atualizado_em = ?, resolvido_em = ?, historico = ? WHERE id = ?"
      )
      .run(movido.status, movido.atualizadoEm, movido.resolvidoEm, JSON.stringify(movido.historico), id);
    return this.buscarPorId(id)!;
  }

  atribuirResponsavel(id: string, responsavel: string): Problema {
    this.db
      .prepare("UPDATE problems SET responsavel = ?, atualizado_em = ? WHERE id = ?")
      .run(responsavel, new Date().toISOString(), id);
    return this.buscarPorId(id)!;
  }

  /** "Estou preso neste problema" — com as respostas às perguntas rápidas. */
  marcarPreso(id: string, pedido: Omit<PedidoAjuda, "em">): Problema {
    const agora = new Date().toISOString();
    const pedidoAjuda: PedidoAjuda = { ...pedido, em: agora };
    this.db
      .prepare("UPDATE problems SET preso = 1, pedido_ajuda = ?, atualizado_em = ? WHERE id = ?")
      .run(JSON.stringify(pedidoAjuda), agora, id);
    return this.buscarPorId(id)!;
  }

  listarPorUsuario(userId: string): Problema[] {
    const rows = this.db
      .prepare("SELECT * FROM problems WHERE user_id = ? ORDER BY criado_em DESC")
      .all(userId) as ProblemaRow[];
    return rows.map(toProblema);
  }

  listarNoPeriodo(inicioISO: string, fimISO: string): Problema[] {
    const rows = this.db
      .prepare("SELECT * FROM problems WHERE criado_em >= ? AND criado_em < ? ORDER BY criado_em DESC")
      .all(inicioISO, fimISO) as ProblemaRow[];
    return rows.map(toProblema);
  }

  listarTodos(): Problema[] {
    return (this.db.prepare("SELECT * FROM problems ORDER BY criado_em DESC").all() as ProblemaRow[]).map(
      toProblema
    );
  }

  listarPresos(): Problema[] {
    const rows = this.db
      .prepare("SELECT * FROM problems WHERE preso = 1 AND status NOT IN ('RESOLVIDO', 'CANCELADO') ORDER BY criado_em")
      .all() as ProblemaRow[];
    return rows.map(toProblema);
  }
}
