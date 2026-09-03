import { DataSource, emptyDay } from '../DataSource.js';
import { acumular, historicoDe, pontosDe } from '../snapshotBuffer.js';
import { nowInTimezone } from '../../core/clock.js';
import { PublishedFileSource } from './PublishedFileSource.js';

/**
 * PRODUÇÃO LANÇADA PELO GESTOR
 * ============================
 *
 * Origem para quando o sistema de pedidos ainda não oferece um endereço de
 * dados: o gestor cola a lista da tela (ou digita) e a Liga passa a funcionar
 * com produção real.
 *
 * Cada lançamento é carimbado com o horário e guardado, de modo que os
 * lançamentos do dia formam a curva — e com a curva vêm ritmo, projeção e
 * comparação com o mesmo horário do dia anterior.
 *
 * LIMITE, dito na tela e aqui: o que foi lançado vive no navegador de quem
 * lançou. Para a equipe inteira enxergar, a produção precisa vir de uma origem
 * compartilhada — ver docs/INTEGRACAO-DADOS.md.
 */
export class ManualSource extends DataSource {
  static id = 'manual';

  static label = 'Lançamento pelo gestor';

  constructor(options = {}) {
    super(options);
    this.timezone = options.timezone ?? 'America/Sao_Paulo';
    this.publicado = new PublishedFileSource(options);
  }

  get semantics() {
    return 'cumulative';
  }

  get isConnected() {
    return true;
  }

  get capabilities() {
    return { scopedRanking: false };
  }

  async fetchDay(date, scope) {
    const registros = historicoDe(date);
    if (!registros.length) {
      // Nada lançado neste navegador para o dia. Antes de dizer que não há
      // produção, olhamos o que já foi publicado no repositório — é assim que a
      // comparação com ontem continua funcionando no dia seguinte, sem o gestor
      // precisar relançar nada.
      return this.publicado.fetchDay(date, scope);
    }
    return {
      status: 'ready',
      records: registros,
      semantics: 'cumulative',
      date,
      fetchedAt: null,
      message: null,
      meta: { manual: true, ...pontosDe(date) },
    };
  }

  async health() {
    const hoje = nowInTimezone(this.timezone).date;
    const p = pontosDe(hoje);
    return {
      ok: p.registros > 0,
      label: ManualSource.label,
      detail: p.registros
        ? `${p.horarios} lançamento(s) hoje, entre ${p.primeiro} e ${p.ultimo}. `
          + 'Os lançamentos ficam neste navegador: para a equipe enxergar, a produção precisa vir de uma origem compartilhada.'
        : 'Nenhuma produção lançada hoje. Use a aba Lançar para colar a lista do sistema de pedidos.',
    };
  }
}

/**
 * Registra um lançamento. Cada linha vira um ponto da curva do dia.
 *
 * @param {string} date
 * @param {{sellerId:string, sellerName:string, orders:number, revenue:number}[]} linhas
 * @param {{timezone?:string, hora?:string}} opcoes
 * @returns {{registros:number, hora:string}}
 */
export function registrarProducao(date, linhas, opcoes = {}) {
  const hora = opcoes.hora ?? nowInTimezone(opcoes.timezone ?? 'America/Sao_Paulo').time;
  const registros = (linhas ?? [])
    .filter((l) => l.sellerId && (Number(l.orders) > 0 || Number(l.revenue) > 0))
    .map((l) => ({
      sellerId: l.sellerId,
      sellerName: l.sellerName,
      date,
      time: hora,
      orders: Number(l.orders) || 0,
      revenue: Number(l.revenue) || 0,
    }));

  acumular(date, registros);
  return { registros: registros.length, hora };
}
