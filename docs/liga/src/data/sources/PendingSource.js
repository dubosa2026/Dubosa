import { DataSource, emptyDay } from '../DataSource.js';

/**
 * MODO DE ESPERA DE DADOS
 * =======================
 *
 * A forma de carregamento da base ainda NÃO foi definida. Esta é a fonte ativa
 * por padrão: ela não inventa dados, não assume Excel, CSV, Google Sheets, API
 * nem banco de dados. Ela apenas responde, de forma honesta, que a base ainda
 * não está conectada.
 *
 * Todo o resto do aplicativo — navegação, permissões, ranking, cálculos,
 * projeções, gamificação — funciona normalmente sobre esta resposta vazia.
 *
 * Quando a fonte real for definida, basta criar o adaptador correspondente e
 * apontar `dataSource.adapter` em config/app.config.json para ele.
 */
export class PendingSource extends DataSource {
  static id = 'pending';

  static label = 'Aguardando definição da base';

  get isConnected() {
    return false;
  }

  async fetchDay(date) {
    return emptyDay(date, {
      status: 'awaiting_source',
      message: 'A base de dados ainda não foi conectada.',
      meta: {
        awaiting: true,
        expectedFields: ['Nome', 'Data', 'Horário', 'Número de pedidos', 'Faturamento'],
      },
    });
  }

  async fetchDays(dates) {
    const out = {};
    for (const date of dates) out[date] = await this.fetchDay(date);
    return out;
  }

  async fetchRoster() {
    return [];
  }

  async health() {
    return {
      ok: false,
      label: PendingSource.label,
      detail:
        'Nenhuma origem de dados definida. O aplicativo está em Modo de Espera: '
        + 'as telas dependentes de produção mostram estado de espera até que a base seja conectada.',
    };
  }
}
