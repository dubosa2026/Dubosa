import DatabaseConstructor, { type Database } from "better-sqlite3";
import { SCHEMA_SQL } from "./schema";

/**
 * Abre (criando se necessário) o banco SQLite local do FOCO e aplica o
 * schema. Em V1 cada máquina de vendedor/gerente tem seu próprio arquivo;
 * a mesma função de repositórios funcionará contra uma futura API central
 * apontando para PostgreSQL, bastando trocar a implementação injetada.
 */
export function openDatabase(filePath: string): Database {
  const db = new DatabaseConstructor(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

export function nextCounterValue(db: Database, nome: string): number {
  const tx = db.transaction((counterName: string) => {
    const row = db.prepare("SELECT valor FROM counters WHERE nome = ?").get(counterName) as
      | { valor: number }
      | undefined;
    const proximo = (row?.valor ?? 0) + 1;
    db.prepare(
      "INSERT INTO counters (nome, valor) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor"
    ).run(counterName, proximo);
    return proximo;
  });
  return tx(nome);
}
