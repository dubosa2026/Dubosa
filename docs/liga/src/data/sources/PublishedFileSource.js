import { DataSource, emptyDay } from '../DataSource.js';

/**
 * PRODUÇÃO PUBLICADA JUNTO COM O APLICATIVO
 * =========================================
 *
 * Fecha o buraco entre o que o gestor lança e o que a equipe enxerga.
 *
 * O lançamento manual vive no navegador de quem lançou — o vendedor, na
 * máquina dele, não veria nada. Esta fonte lê a produção de um arquivo
 * publicado junto com o aplicativo (`config/producao/AAAA-MM-DD.json`), que o
 * gestor gera com um clique e envia ao repositório do mesmo jeito que já faz
 * com o cadastro da equipe.
 *
 * Sem servidor, sem senha, sem custo — e todo mundo vê o mesmo placar.
 *
 * Quando não existe arquivo para o dia, a resposta é exatamente a do Modo de
 * Espera: o aplicativo funciona inteiro e as telas dependentes de produção
 * mostram estado de espera, sem número inventado.
 *
 * LIMITE: o placar avança quando o gestor publica. Para acompanhamento contínuo
 * sem intervenção, a origem precisa de servidor — ver docs/INTEGRACAO-DADOS.md.
 */
export class PublishedFileSource extends DataSource {
  static id = 'arquivo';

  static label = 'Produção publicada no repositório';

  constructor(options = {}) {
    super(options);
    this.pasta = options.pasta ?? 'config/producao';
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

  caminhoDe(date) {
    return `${this.pasta}/${date}.json`;
  }

  async fetchDay(date) {
    let json;
    try {
      const res = await fetch(this.caminhoDe(date), { cache: 'no-cache' });
      if (res.status === 404) {
        return emptyDay(date, {
          status: 'awaiting_source',
          message: 'Nenhuma produção publicada para este dia.',
          meta: { awaiting: true, arquivo: this.caminhoDe(date) },
        });
      }
      if (!res.ok) {
        return emptyDay(date, {
          status: 'error',
          message: `Não consegui ler ${this.caminhoDe(date)} (${res.status}).`,
        });
      }
      json = await res.json();
    } catch (err) {
      // Aqui NAO e "ainda nao publicaram": o pedido nem chegou a ter resposta.
      // Sem rede, endereco errado ou origem fora do ar dao exatamente a mesma
      // tela de "aguardando a base" que um dia que ainda nao comecou — e quem
      // olha nao tem como saber qual dos dois e. Entao esta e a unica saida
      // deste metodo que se declara erro.
      return emptyDay(date, {
        status: 'error',
        message: `Não consegui alcançar ${this.pasta}. Verifique o endereço da origem e a conexão.`,
        meta: { detalhe: err.message, origem: this.pasta },
      });
    }

    const records = Array.isArray(json) ? json : json?.records ?? json?.registros ?? [];
    if (!records.length) {
      return emptyDay(date, {
        status: 'awaiting_source',
        message: 'O arquivo do dia está vazio.',
        meta: { awaiting: true },
      });
    }

    return {
      status: 'ready',
      records: records.map((r) => ({ ...r, date })),
      semantics: json?.semantics ?? 'cumulative',
      date,
      fetchedAt: json?.publicadoEm ?? null,
      message: null,
      meta: {
        publicado: true,
        publicadoEm: json?.publicadoEm ?? null,
        arquivo: this.caminhoDe(date),
        // O coletor declara se a origem tem faturamento por vendedor. Sem
        // repassar, o aplicativo leria zero como "não vendeu" em vez de
        // "não informado", e ranquearia todo mundo empatado em R$ 0.
        faturamentoPorVendedor: json?.faturamentoPorVendedor,
      },
    };
  }

  async health() {
    return {
      ok: true,
      label: PublishedFileSource.label,
      detail: `Lendo ${this.pasta}/AAAA-MM-DD.json. Enquanto o dia não for publicado, `
        + 'o aplicativo fica em Modo de Espera — funcionando por inteiro, sem inventar número.',
    };
  }
}

/** Conteúdo pronto para virar `config/producao/AAAA-MM-DD.json`. */
export function exportarDia(date, dayState) {
  const records = [];
  for (const seller of dayState?.sellers ?? []) {
    for (const ponto of seller.timeline ?? []) {
      records.push({
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        date,
        time: `${String(Math.floor(ponto.m / 60)).padStart(2, '0')}:${String(ponto.m % 60).padStart(2, '0')}`,
        orders: ponto.orders,
        revenue: ponto.revenue,
      });
    }
  }
  return JSON.stringify(
    {
      _leia_me: 'Produção publicada da Liga Comercial. Gerado pelo próprio aplicativo.',
      data: date,
      publicadoEm: new Date().toISOString(),
      semantics: 'cumulative',
      records,
    },
    null,
    2,
  );
}
