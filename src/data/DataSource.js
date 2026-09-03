/**
 * INTERFACE DE FONTE DE DADOS
 * ===========================
 *
 * O aplicativo NUNCA fala com uma planilha, um arquivo ou uma API diretamente.
 * Ele fala com esta interface. Trocar a origem dos dados no futuro significa
 * escrever uma classe nova aqui dentro e registrá-la — nada mais muda.
 *
 * REGRA DE PRIVACIDADE ESTRUTURAL
 * -------------------------------
 * `fetchDay` recebe um ESCOPO. O adaptador é obrigado a devolver apenas o que
 * o escopo permite. Um adaptador com servidor (API, banco) deve aplicar o filtro
 * NO SERVIDOR: é a única forma de garantir que os dados dos outros vendedores
 * nunca cheguem ao navegador do vendedor. A camada `core/access.js` é a segunda
 * barreira, não a primeira.
 *
 * @typedef {Object} Scope
 * @property {'seller'|'manager'} role
 * @property {string|null} sellerId  Preenchido quando role === 'seller'
 * @property {'own'|'team'} include  'own' = só os registros da própria pessoa
 *
 * @typedef {Object} DayPayload
 * @property {'ready'|'awaiting_source'|'error'} status
 * @property {import('./types.js').ProductionRecord[]} records
 * @property {'cumulative'|'incremental'} semantics
 * @property {string} date
 * @property {string|null} fetchedAt  ISO
 * @property {string|null} message    Texto exibido ao usuário quando não há dados
 * @property {Object} meta
 */

export class DataSource {
  /** Identificador curto do adaptador. */
  static id = 'abstract';

  /** Nome legível, exibido no painel do gestor. */
  static label = 'Fonte abstrata';

  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Semântica dos registros produzidos por esta fonte.
   * @returns {'cumulative'|'incremental'}
   */
  get semantics() {
    return 'cumulative';
  }

  /**
   * O que esta fonte consegue fazer.
   *
   * `scopedRanking: true` significa que a FONTE calcula posição e distâncias
   * para o vendedor e devolve apenas o resultado anônimo. É o modo ideal: os
   * números dos colegas nunca saem do servidor.
   *
   * `scopedRanking: false` significa que o ranking precisa ser calculado no
   * aplicativo — o que exige receber o dia inteiro. Nesse modo a privacidade é
   * garantida por `core/access.js`, que monta o painel do vendedor sem nenhum
   * dado de terceiro, mas o dado bruto chegou ao navegador. Documente isso ao
   * escolher a fonte definitiva.
   */
  get capabilities() {
    return { scopedRanking: false };
  }

  /**
   * Contexto competitivo anônimo já calculado pela fonte.
   * Só faz sentido quando `capabilities.scopedRanking` é true.
   * @returns {Promise<{position:number,total:number,toNext:Object|null,toPrevious:Object|null}|null>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchCompetitiveContext(date, scope) {
    return null;
  }

  /**
   * Esta fonte já está conectada a dados reais?
   * Em Modo de Espera isto é `false` e a interface mostra o estado de espera.
   */
  get isConnected() {
    return false;
  }

  /**
   * Produção de um dia.
   * @param {string} date 'YYYY-MM-DD'
   * @param {Scope} scope
   * @returns {Promise<DayPayload>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchDay(date, scope) {
    throw new Error('fetchDay() não implementado');
  }

  /**
   * Produção de vários dias (usado para recordes, sequências e curva de ontem).
   * Implementação padrão: repete fetchDay. Um adaptador com API deve
   * sobrescrever com uma única chamada em lote.
   * @param {string[]} dates
   * @param {Scope} scope
   * @returns {Promise<Record<string, DayPayload>>}
   */
  async fetchDays(dates, scope) {
    const out = {};
    for (const date of dates) {
      // eslint-disable-next-line no-await-in-loop
      out[date] = await this.fetchDay(date, scope);
    }
    return out;
  }

  /**
   * Lista de vendedores conhecidos pela fonte (somente gestor).
   * @returns {Promise<{sellerId: string, sellerName: string}[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async fetchRoster(scope) {
    return [];
  }

  /** Diagnóstico exibido no painel do gestor. */
  async health() {
    return { ok: this.isConnected, label: this.constructor.label, detail: null };
  }
}

/** Resposta vazia padronizada — usada por qualquer fonte sem dados para o dia. */
export function emptyDay(date, { status = 'ready', message = null, meta = {} } = {}) {
  return {
    status,
    records: [],
    semantics: 'cumulative',
    date,
    fetchedAt: new Date().toISOString(),
    message,
    meta,
  };
}
