import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../../auth";
import type { Role, User } from "../../types";

interface UserRow {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  role: Role;
  gerente_id: string | null;
  ativo: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    role: row.role,
    gerenteId: row.gerente_id,
    ativo: row.ativo === 1,
  };
}

export class UserRepository {
  constructor(private readonly db: Database) {}

  criar(dados: { nome: string; email: string; senha: string; role: Role; gerenteId?: string | null }): User {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO users (id, nome, email, senha_hash, role, gerente_id, ativo)
         VALUES (@id, @nome, @email, @senhaHash, @role, @gerenteId, 1)`
      )
      .run({
        id,
        nome: dados.nome,
        email: dados.email,
        senhaHash: hashPassword(dados.senha),
        role: dados.role,
        gerenteId: dados.gerenteId ?? null,
      });
    return this.buscarPorId(id)!;
  }

  buscarPorId(id: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  buscarPorEmail(email: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  listarTodos(): User[] {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY nome").all() as UserRow[];
    return rows.map(toUser);
  }

  listarVendedoresDoGerente(gerenteId: string): User[] {
    const rows = this.db
      .prepare("SELECT * FROM users WHERE gerente_id = ? AND role = 'VENDEDOR' ORDER BY nome")
      .all(gerenteId) as UserRow[];
    return rows.map(toUser);
  }

  listarTodosVendedores(): User[] {
    const rows = this.db.prepare("SELECT * FROM users WHERE role = 'VENDEDOR' ORDER BY nome").all() as UserRow[];
    return rows.map(toUser);
  }

  /** Autentica por e-mail/senha; retorna o usuário se as credenciais forem válidas. */
  autenticar(email: string, senha: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!row) return null;
    if (!verifyPassword(senha, row.senha_hash)) return null;
    return toUser(row);
  }
}
