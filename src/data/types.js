/**
 * CONTRATO CANÔNICO DE DADOS
 * ==========================
 *
 * Este é o único formato que o aplicativo entende. Qualquer fonte futura
 * (planilha, CSV, Google Sheets, API, banco de dados) precisa apenas produzir
 * registros neste formato — nada além desta camada precisa mudar.
 *
 * Campos mínimos exigidos pela especificação:
 *   Nome | Data | Horário | Número de pedidos | Faturamento
 *
 * @typedef {Object} ProductionRecord
 * @property {string} sellerId    Identificador estável (derivado do nome se a fonte não tiver id)
 * @property {string} sellerName  Nome do vendedor ou da vendedora
 * @property {string} date        Dia da produção, 'YYYY-MM-DD'
 * @property {string} time        Horário da medição, 'HH:mm'
 * @property {number} orders      Número de pedidos
 * @property {number} revenue     Faturamento em reais
 *
 * SEMÂNTICA — declarada pela fonte, não adivinhada:
 *   'cumulative'  cada registro é o ACUMULADO do vendedor no dia até aquele horário
 *                 (ex.: "às 14h João tinha 12 pedidos e R$ 98.000")
 *   'incremental' cada registro é um EVENTO isolado que soma ao dia
 *                 (ex.: "às 14h07 João fechou 1 pedido de R$ 8.200")
 *
 * O normalizador converte as duas formas na mesma linha do tempo acumulada.
 */

export const SEMANTICS = Object.freeze({
  CUMULATIVE: 'cumulative',
  INCREMENTAL: 'incremental',
});

export const REQUIRED_FIELDS = Object.freeze(['sellerName', 'date', 'time', 'orders', 'revenue']);

/**
 * Mapa de campos padrão: aceita os nomes de coluna mais prováveis em português
 * e inglês. A fonte futura pode sobrescrever passando o seu próprio mapa.
 */
export const DEFAULT_FIELD_MAP = Object.freeze({
  sellerId: ['sellerId', 'id', 'codigo', 'código', 'matricula', 'matrícula'],
  sellerName: ['sellerName', 'nome', 'vendedor', 'vendedora', 'name', 'representante'],
  date: ['date', 'data', 'dia'],
  time: ['time', 'horario', 'horário', 'hora'],
  orders: ['orders', 'pedidos', 'qtdPedidos', 'quantidade_pedidos', 'num_pedidos'],
  revenue: ['revenue', 'faturamento', 'valor', 'venda', 'vendas', 'total'],
});

/** Erro de importação com contexto suficiente para o gestor corrigir a origem. */
export class ImportError extends Error {
  constructor(message, { row, line, field } = {}) {
    super(message);
    this.name = 'ImportError';
    this.row = row;
    this.line = line;
    this.field = field;
  }
}

/** Normaliza um nome em um id estável (sem acento, minúsculo, com hífen). */
export function slugifyName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sem-nome';
}

/** Aceita 'YYYY-MM-DD', 'DD/MM/YYYY' e Date. Devolve 'YYYY-MM-DD'. */
export function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** Aceita '14:30', '14:30:00', '14h30', 14.5 (fração de dia do Excel). */
export function normalizeTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Fração de dia (formato serial de planilha): 0,5 => 12:00
    const frac = value > 1 ? value % 1 : value;
    const mins = Math.round(frac * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{1,2})[:hH.](\d{1,2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Aceita 126500, '126500', 'R$ 126.500,00', '126,500.00'. */
export function normalizeMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value ?? '').trim();
  if (!s) return null;
  s = s.replace(/[R$\s ]/gi, '');
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');       // 126.500,00
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');                           // 126,500.00
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Aceita 14, '14', '14 pedidos'. */
export function normalizeCount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const s = String(value ?? '').replace(/[^\d-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function pick(row, candidates) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  const lowered = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [slugifyName(k), v]),
  );
  for (const key of candidates) {
    const k = slugifyName(key);
    if (lowered[k] !== undefined && lowered[k] !== null && lowered[k] !== '') return lowered[k];
  }
  return undefined;
}

/**
 * Converte uma linha bruta de qualquer fonte em ProductionRecord.
 * @throws {ImportError} quando um campo obrigatório está ausente ou inválido.
 */
export function toRecord(row, { fieldMap = DEFAULT_FIELD_MAP, line } = {}) {
  const sellerName = String(pick(row, fieldMap.sellerName) ?? '').trim();
  if (!sellerName) throw new ImportError('Nome do vendedor ausente', { row, line, field: 'sellerName' });

  const date = normalizeDate(pick(row, fieldMap.date));
  if (!date) throw new ImportError(`Data inválida para "${sellerName}"`, { row, line, field: 'date' });

  const time = normalizeTime(pick(row, fieldMap.time));
  if (time === null) throw new ImportError(`Horário inválido para "${sellerName}"`, { row, line, field: 'time' });

  const orders = normalizeCount(pick(row, fieldMap.orders));
  if (orders === null) throw new ImportError(`Pedidos inválidos para "${sellerName}"`, { row, line, field: 'orders' });

  const revenue = normalizeMoney(pick(row, fieldMap.revenue));
  if (revenue === null) throw new ImportError(`Faturamento inválido para "${sellerName}"`, { row, line, field: 'revenue' });

  const rawId = pick(row, fieldMap.sellerId);
  const sellerId = rawId ? String(rawId).trim() : slugifyName(sellerName);

  return { sellerId, sellerName, date, time, orders, revenue };
}

/**
 * Converte um lote de linhas brutas. Nunca lança: devolve os registros válidos
 * e a lista de problemas, para que o gestor veja exatamente o que ficou de fora.
 * @returns {{records: ProductionRecord[], errors: {line:number, message:string, field:string}[]}}
 */
export function toRecords(rows, options = {}) {
  const records = [];
  const errors = [];
  (rows ?? []).forEach((row, index) => {
    try {
      records.push(toRecord(row, { ...options, line: index + 1 }));
    } catch (err) {
      errors.push({ line: index + 1, message: err.message, field: err.field ?? null });
    }
  });
  return { records, errors };
}
