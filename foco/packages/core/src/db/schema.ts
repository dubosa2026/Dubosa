/**
 * Esquema SQLite embutido como string (em vez de um arquivo .sql lido em
 * tempo de execução) para não depender de resolução de caminho de arquivo
 * depois de compilado/empacotado pelo electron-builder (asar). V1, local
 * por máquina; desenhado para migrar sem atrito para PostgreSQL numa
 * futura API central: tipos simples, IDs em texto (uuid), timestamps ISO
 * 8601 em texto.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('VENDEDOR', 'GERENTE', 'ADMIN')),
  gerente_id TEXT REFERENCES users(id),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  categoria TEXT NOT NULL CHECK (
    categoria IN ('PROSPECCAO', 'NEGOCIACAO', 'FOLLOWUP', 'PROBLEMA', 'COTACAO_OPERACIONAL', 'OUTROS')
  ),
  inicio TEXT NOT NULL,
  fim TEXT,
  problema_id TEXT REFERENCES problems(id)
);

CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  protocolo TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  cliente TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  prioridade TEXT NOT NULL,
  area_responsavel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'EM_ANDAMENTO', 'RESOLVIDO')),
  preso INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrator_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  cliente TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (
    tipo IN ('COTACAO', 'PEDIDO', 'CONSULTA_PRECO', 'CONSULTA_ESTOQUE', 'CONSULTA_FRETE')
  ),
  origem TEXT NOT NULL CHECK (origem IN ('INTEGRADOR', 'VENDEDOR')),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  nome TEXT PRIMARY KEY,
  valor INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_inicio ON time_entries(inicio);
CREATE INDEX IF NOT EXISTS idx_problems_user ON problems(user_id);
CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE INDEX IF NOT EXISTS idx_integrator_actions_user ON integrator_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_integrator_actions_cliente ON integrator_actions(cliente);
`;
