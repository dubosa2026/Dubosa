import { DataSource, emptyDay } from '../DataSource.js';

/**
 * FONTE COM ESCOPO NO SERVIDOR
 * ============================
 *
 * Conversa com `netlify/functions/producao.mjs`, que busca o sistema de
 * pedidos, guarda a senha em variável de ambiente e calcula o ranking no
 * servidor.
 *
 * É o único desenho em que a privacidade é garantida no TRANSPORTE, e não só na
 * exibição: o navegador do vendedor recebe os próprios números mais a posição e
 * as distâncias — nunca uma linha de outra pessoa.
 *
 * Opções:
 *   endpoint  padrão '/api/producao'. Use o endereço completo quando o
 *             aplicativo estiver hospedado fora do Netlify (GitHub Pages, por
 *             exemplo): 'https://seu-site.netlify.app/api/producao'.
 *   token     o código pessoal de quem está usando o aplicativo.
 */
export class LigaApiSource extends DataSource {
  static id = 'liga-api';

  static label = 'Servidor da Liga (escopo na origem)';

  constructor(options = {}) {
    super(options);
    this.endpoint = options.endpoint ?? '/api/producao';
    this.token = options.token ?? '';
    this.lastCompetitive = null;
    this.lastTeam = null;
  }

  get semantics() {
    return 'cumulative';
  }

  get isConnected() {
    return Boolean(this.endpoint && this.token);
  }

  get capabilities() {
    return { scopedRanking: true };
  }

  buildUrl(date, hora) {
    const url = new URL(this.endpoint, globalThis.location?.origin ?? 'https://localhost');
    url.searchParams.set('data', date);
    url.searchParams.set('token', this.token);
    if (hora) url.searchParams.set('hora', hora);
    return url.toString();
  }

  async fetchDay(date, scope) {
    if (!this.token) {
      return emptyDay(date, { status: 'awaiting_source', message: 'Sem código de acesso.' });
    }

    let payload;
    try {
      const res = await fetch(this.buildUrl(date, scope?.atTime), { cache: 'no-store' });
      payload = await res.json();
      if (!res.ok) {
        return emptyDay(date, {
          status: res.status === 403 ? 'awaiting_source' : 'error',
          message: payload?.message ?? `O servidor respondeu ${res.status}.`,
        });
      }
    } catch (err) {
      return emptyDay(date, {
        status: 'error',
        message: `Não consegui falar com o servidor da Liga. ${err.message}`,
      });
    }

    // Guardados para o aplicativo usar em vez de recalcular o ranking — que
    // ele nem teria como fazer, já que não recebeu os dados dos colegas.
    this.lastCompetitive = payload.competitive ?? null;
    this.lastTeam = payload.team ?? null;

    return {
      status: payload.status ?? 'ready',
      records: payload.records ?? [],
      semantics: payload.semantics ?? 'cumulative',
      date,
      fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
      message: payload.message ?? null,
      meta: { ...(payload.meta ?? {}), competitive: payload.competitive ?? null, team: payload.team ?? null },
    };
  }

  async fetchCompetitiveContext(date, scope) {
    if (this.lastCompetitive) return this.lastCompetitive;
    await this.fetchDay(date, scope);
    return this.lastCompetitive;
  }

  async health() {
    return {
      ok: this.isConnected,
      label: LigaApiSource.label,
      detail: this.isConnected
        ? 'O ranking é calculado no servidor. O navegador do vendedor não recebe nenhum dado de colega.'
        : 'Endereço ou código de acesso ausente.',
    };
  }
}
