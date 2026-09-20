/**
 * Esquema SQLite embutido como string, para não depender de resolução de
 * caminho depois de empacotado. V1 local por máquina; desenhado para
 * migrar sem atrito para PostgreSQL na API central: IDs em texto,
 * timestamps ISO 8601, JSON em colunas de texto.
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

CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  protocolo TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  cliente TEXT,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  prioridade TEXT NOT NULL,
  area_responsavel TEXT NOT NULL,
  responsavel TEXT,
  status TEXT NOT NULL DEFAULT 'NOVO' CHECK (
    status IN ('NOVO', 'EM_ANALISE', 'ENCAMINHADO', 'AGUARDANDO_AREA',
               'AGUARDANDO_VENDEDOR', 'RESOLVIDO', 'CANCELADO')
  ),
  origem TEXT NOT NULL DEFAULT 'REGISTRO_VENDEDOR' CHECK (
    origem IN ('REGISTRO_VENDEDOR', 'DETECCAO_EMAIL', 'DETECCAO_WHATSAPP')
  ),
  preso INTEGER NOT NULL DEFAULT 0,
  pedido_ajuda TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  resolvido_em TEXT,
  historico TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  categoria TEXT NOT NULL CHECK (
    categoria IN ('COMERCIAL', 'ATENDIMENTO', 'PROBLEMA_OPERACIONAL',
                  'REUNIAO', 'ADMINISTRATIVO', 'PAUSA')
  ),
  inicio TEXT NOT NULL,
  fim TEXT,
  problema_id TEXT REFERENCES problems(id),
  alteracoes TEXT NOT NULL DEFAULT '[]'
);

-- Eventos vindos das integrações autorizadas. Guardamos assunto e
-- classificação, nunca o conteúdo integral da mensagem.
CREATE TABLE IF NOT EXISTS identified_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  fonte TEXT NOT NULL CHECK (fonte IN ('EMAIL', 'WHATSAPP')),
  ocorrido_em TEXT NOT NULL,
  assunto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  relevancia TEXT NOT NULL CHECK (relevancia IN ('ALTA', 'MEDIA', 'BAIXA', 'IGNORAR')),
  cliente TEXT,
  problema_id TEXT REFERENCES problems(id)
);

CREATE TABLE IF NOT EXISTS counters (
  nome TEXT PRIMARY KEY,
  valor INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_inicio ON time_entries(inicio);
CREATE INDEX IF NOT EXISTS idx_problems_user ON problems(user_id);
CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE INDEX IF NOT EXISTS idx_problems_criado ON problems(criado_em);
CREATE INDEX IF NOT EXISTS idx_events_user ON identified_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_ocorrido ON identified_events(ocorrido_em);
`;
