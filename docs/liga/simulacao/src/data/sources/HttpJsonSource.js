import { DataSource, emptyDay } from '../DataSource.js';
import { toRecords, DEFAULT_FIELD_MAP } from '../types.js';
import { nowInTimezone } from '../../core/clock.js';
import { acumular, historicoDe } from '../snapshotBuffer.js';

/**
 * FONTE HTTP/JSON GENÉRICA
 * ========================
 *
 * Adaptador para qualquer origem que responda JSON por HTTP — inclusive o
 * sistema de pedidos da direção. Nada aqui é específico de um fornecedor: o
 * endereço, a autenticação, o caminho até a lista e o nome das colunas são
 * configuração, não código.
 *
 * Opções:
 *
 *   url             endereço. Aceita {data} (2026-09-03), {dataBR} (03/09/2026)
 *                   e {hora} (15:30), substituídos a cada busca.
 *   method          'GET' (padrão) ou 'POST'
 *   auth            { mode, field, value }
 *                     'none'   sem autenticação
 *                     'query'  vai como parâmetro na URL       (?senha=...)
 *                     'header' vai como cabeçalho              (Authorization: ...)
 *                     'body'   vai no corpo do POST            ({"senha": "..."})
 *   collectionPath  caminho até o array, separado por ponto ('dados.vendedores').
 *                   Vazio = a resposta já é o array, ou o adaptador procura o
 *                   primeiro array de objetos que encontrar.
 *   fieldMap        nomes de coluna aceitos para cada campo canônico
 *   semantics       'cumulative' (acumulado do dia) | 'incremental' (pedido a pedido)
 *   timeMode        'field'     a origem traz o horário de cada registro
 *                   'fetchTime' a origem só diz "como está agora" — o horário
 *                               da coleta é carimbado no registro
 *
 * SOBRE O SEGREDO: quando `auth.value` é uma senha, ela NÃO pode ser publicada
 * junto com o aplicativo — um arquivo em hospedagem estática é público. Por isso
 * a tela de configuração guarda a conexão apenas no navegador do gestor e
 * recusa exportá-la para o repositório. Para a equipe inteira usar, a conexão
 * precisa de servidor: ver `netlify/functions/producao.mjs` e
 * docs/INTEGRACAO-DADOS.md.
 */
export class HttpJsonSource extends DataSource {
  static id = 'http-json';

  static label = 'Origem HTTP/JSON';

  constructor(options = {}) {
    super(options);
    this.url = options.url ?? '';
    this.method = (options.method ?? 'GET').toUpperCase();
    this.auth = options.auth ?? { mode: 'none' };
    this.collectionPath = options.collectionPath ?? '';
    this.fieldMap = { ...DEFAULT_FIELD_MAP, ...(options.fieldMap ?? {}) };
    this.timeMode = options.timeMode ?? 'field';
    this.timezone = options.timezone ?? 'America/Sao_Paulo';
    this._semantics = options.semantics ?? 'cumulative';
  }

  get semantics() {
    return this._semantics;
  }

  get isConnected() {
    return Boolean(this.url);
  }

  get capabilities() {
    // Origem genérica não calcula ranking: o dia inteiro chega ao navegador e a
    // privacidade fica por conta de core/access.js. Ver docs/PRIVACIDADE.md.
    return { scopedRanking: false };
  }

  /** Monta URL, cabeçalhos e corpo para uma data. */
  buildRequest(date) {
    const now = nowInTimezone(this.timezone);
    const [y, m, d] = String(date).split('-');
    const url = new URL(
      String(this.url)
        .replaceAll('{data}', date)
        .replaceAll('{dataBR}', `${d}/${m}/${y}`)
        .replaceAll('{hora}', now.time),
    );

    const headers = { Accept: 'application/json' };
    let body;

    if (this.auth?.mode === 'query' && this.auth.field) {
      url.searchParams.set(this.auth.field, this.auth.value ?? '');
    } else if (this.auth?.mode === 'header' && this.auth.field) {
      headers[this.auth.field] = this.auth.value ?? '';
    } else if (this.auth?.mode === 'body') {
      body = { [this.auth.field || 'senha']: this.auth.value ?? '' };
    }

    if (this.method === 'POST') {
      headers['Content-Type'] = 'application/json';
      body = { ...(body ?? {}), data: date };
    }

    return { url: url.toString(), headers, body };
  }

  async fetchDay(date) {
    const hoje = nowInTimezone(this.timezone).date;

    // Em modo snapshot, dia passado não se busca: se existe curva, ela veio do
    // que foi acumulado enquanto o aplicativo esteve aberto naquele dia.
    if (this.timeMode === 'fetchTime' && date !== hoje) {
      const guardado = historicoDe(date);
      return guardado.length
        ? {
          status: 'ready',
          records: guardado,
          semantics: this.semantics,
          date,
          fetchedAt: null,
          message: null,
          meta: { doHistoricoLocal: true },
        }
        : emptyDay(date, {
          status: 'ready',
          message: 'Sem histórico guardado para este dia.',
          meta: { semHistorico: true },
        });
    }

    if (!this.url) {
      return emptyDay(date, { status: 'awaiting_source', message: 'Endereço da origem não configurado.' });
    }

    const { url, headers, body } = this.buildRequest(date);

    let response;
    try {
      response = await fetch(url, {
        method: this.method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (err) {
      // Falha de rede no navegador quase sempre é CORS: a origem não autoriza
      // o endereço do aplicativo. A mensagem precisa dizer isso, senão o gestor
      // fica procurando erro no lugar errado.
      return emptyDay(date, {
        status: 'error',
        message: 'A origem não respondeu ao aplicativo. Quase sempre é bloqueio de CORS: '
          + 'o servidor de pedidos precisa autorizar o endereço deste aplicativo, '
          + 'ou a busca precisa passar por uma função de servidor. '
          + `Detalhe técnico: ${err.message}`,
        meta: { erro: 'rede-ou-cors' },
      });
    }

    if (!response.ok) {
      return emptyDay(date, {
        status: 'error',
        message: `A origem respondeu ${response.status}${response.status === 401 || response.status === 403 ? ' — autenticação recusada.' : '.'}`,
        meta: { erro: 'http', status: response.status },
      });
    }

    let json;
    try {
      json = await response.json();
    } catch {
      return emptyDay(date, {
        status: 'error',
        message: 'A origem respondeu, mas o conteúdo não é JSON. Confira se o endereço aponta para os dados e não para a página do site.',
        meta: { erro: 'nao-json' },
      });
    }

    return this.parse(json, date);
  }

  /** Converte a resposta bruta em registros canônicos. */
  parse(json, date) {
    const linhas = extractCollection(json, this.collectionPath);
    if (!linhas) {
      return emptyDay(date, {
        status: 'error',
        message: 'Não encontrei a lista de vendedores dentro da resposta. '
          + 'Informe o caminho até ela no campo "Caminho até a lista".',
        meta: { erro: 'lista-nao-encontrada', chaves: Object.keys(json ?? {}) },
      });
    }

    const horaColeta = nowInTimezone(this.timezone).time;
    const preparadas = this.timeMode === 'fetchTime'
      ? linhas.map((linha) => ({ ...linha, __hora: horaColeta, __data: date }))
      : linhas;

    const fieldMap = this.timeMode === 'fetchTime'
      ? { ...this.fieldMap, time: ['__hora', ...this.fieldMap.time], date: ['__data', ...this.fieldMap.date] }
      : this.fieldMap;

    const { records, errors } = toRecords(preparadas, { fieldMap });

    if (!records.length) {
      return emptyDay(date, {
        status: 'error',
        message: 'A lista foi encontrada, mas nenhuma linha pôde ser lida. '
          + 'Confira o nome das colunas de nome, pedidos e faturamento.',
        meta: { erro: 'colunas', errors: errors.slice(0, 5), amostra: linhas[0] ?? null },
      });
    }

    const doDia = records.map((r) => ({ ...r, date }));

    // Origem sem histórico: cada leitura vira um ponto da curva do dia.
    const finais = this.timeMode === 'fetchTime' ? acumular(date, doDia) : doDia;

    return {
      status: 'ready',
      records: finais,
      semantics: this.semantics,
      date,
      fetchedAt: new Date().toISOString(),
      message: null,
      meta: {
        total: records.length,
        ignoradas: errors.length,
        errors: errors.slice(0, 5),
        acumulado: this.timeMode === 'fetchTime' ? finais.length : null,
      },
    };
  }

  /**
   * DIAGNÓSTICO DA CONEXÃO
   * Roda no navegador do gestor — que alcança o sistema de pedidos — e devolve
   * um relatório do que aconteceu em cada etapa: rede, formato, lista e
   * colunas. É esta função que transforma "não funcionou" em "faltou informar
   * o caminho até a lista".
   */
  async diagnose(date) {
    const etapas = [];
    const registrar = (nome, ok, detalhe, dados = null) => etapas.push({ nome, ok, detalhe, dados });

    if (!this.url) {
      registrar('Endereço', false, 'Nenhum endereço informado.');
      return { ok: false, etapas, bruto: null };
    }

    const { url, headers, body } = this.buildRequest(date);
    registrar('Endereço', true, url);

    let response;
    try {
      response = await fetch(url, {
        method: this.method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (err) {
      registrar('Rede', false,
        'O navegador não conseguiu ler a resposta. Quase sempre é CORS: o servidor de '
        + 'pedidos não autoriza o endereço deste aplicativo. A saída é buscar por uma '
        + `função de servidor. (${err.message})`);
      return { ok: false, etapas, bruto: null };
    }
    registrar('Rede', response.ok, `HTTP ${response.status} ${response.statusText}`.trim());
    if (!response.ok) return { ok: false, etapas, bruto: null };

    const texto = await response.text();
    let json;
    try {
      json = JSON.parse(texto);
      registrar('Formato', true, 'Resposta em JSON.');
    } catch {
      registrar('Formato', false,
        'A resposta não é JSON — provavelmente é a página HTML do site. '
        + 'O endereço precisa apontar para os dados.',
        texto.slice(0, 300));
      return { ok: false, etapas, bruto: texto.slice(0, 2000) };
    }

    return { ...this.diagnoseJson(json, date, etapas), bruto: texto.slice(0, 4000) };
  }

  /** Mesma análise, a partir de um JSON já em mãos (colado pelo gestor). */
  diagnoseJson(json, date, etapas = []) {
    const registrar = (nome, ok, detalhe, dados = null) => etapas.push({ nome, ok, detalhe, dados });

    const linhas = extractCollection(json, this.collectionPath);
    if (!linhas?.length) {
      registrar('Lista de vendedores', false,
        'Não encontrei a lista dentro da resposta. Informe o caminho até ela.',
        { chaves: chavesDe(json) });
      return { ok: false, etapas, amostra: null };
    }
    registrar('Lista de vendedores', true, `${linhas.length} linha(s) encontrada(s).`);

    const colunas = Object.keys(linhas[0] ?? {});
    const payload = this.parse(json, date);
    const lido = payload.status === 'ready';

    registrar('Colunas', lido,
      lido
        ? `Reconheci nome, pedidos e faturamento em ${payload.meta.total} linha(s).`
        : 'Não consegui reconhecer as colunas. Ajuste os nomes abaixo.',
      { colunas, exemplo: linhas[0] });

    return {
      ok: lido,
      etapas,
      amostra: lido ? payload.records.slice(0, 3) : null,
      colunas,
      exemplo: linhas[0] ?? null,
    };
  }

  async health() {
    return {
      ok: this.isConnected,
      label: `${HttpJsonSource.label}${this.url ? ` — ${hostOf(this.url)}` : ''}`,
      detail: this.url
        ? 'Conectado a uma origem HTTP/JSON. O dia inteiro é lido pelo navegador; a privacidade fica por conta do núcleo de acesso.'
        : 'Endereço da origem ainda não configurado.',
    };
  }
}

function chavesDe(json) {
  if (Array.isArray(json)) return [`array com ${json.length} item(ns)`];
  return json && typeof json === 'object' ? Object.keys(json) : [typeof json];
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

/**
 * Encontra a lista de vendedores dentro da resposta.
 * Com caminho informado, segue o caminho. Sem caminho, procura o primeiro array
 * de objetos — o formato mais comum é a resposta já ser esse array.
 */
export function extractCollection(json, path = '') {
  if (path) {
    let cursor = json;
    for (const part of String(path).split('.').filter(Boolean)) {
      cursor = cursor?.[part];
      if (cursor === undefined || cursor === null) return null;
    }
    return normalizeCollection(cursor);
  }
  return findFirstCollection(json, 0);
}

function normalizeCollection(value) {
  if (Array.isArray(value)) return value.filter((v) => v && typeof v === 'object');
  // Objeto no formato { "NOME DO VENDEDOR": { pedidos, faturamento }, ... }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
    if (entries.length) return entries.map(([nome, v]) => ({ nome, ...v }));
  }
  return null;
}

function findFirstCollection(node, depth) {
  if (depth > 4 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    const objetos = node.filter((v) => v && typeof v === 'object' && !Array.isArray(v));
    return objetos.length ? objetos : null;
  }
  for (const value of Object.values(node)) {
    const found = findFirstCollection(value, depth + 1);
    if (found) return found;
  }
  return normalizeCollection(node);
}
