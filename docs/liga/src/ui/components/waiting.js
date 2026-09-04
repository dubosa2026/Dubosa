import { h } from '../dom.js';

/**
 * ESTADO DE ESPERA DE DADOS
 * =========================
 *
 * Enquanto a fonte da base não for definida, as telas que dependem de produção
 * real mostram isto. Nunca um número inventado, nunca um zero disfarçado de
 * resultado: a tela diz, com todas as letras, que ainda não há base conectada.
 */

export function waitingBlock({
  title = 'Aguardando a base de dados',
  detail = 'A origem dos dados ainda não foi definida. Assim que a base for conectada, este painel passa a exibir a produção real do dia.',
  fields = ['Nome', 'Data', 'Horário', 'Número de pedidos', 'Faturamento'],
  compact = false,
  action = null,
} = {}) {
  return h('div', { class: ['waiting', compact && 'waiting-compact'] },
    h('div', { class: 'waiting-icon', 'aria-hidden': 'true', text: '⏳' }),
    h('div', { class: 'waiting-title', text: title }),
    h('p', { class: 'waiting-detail', text: detail }),
    fields?.length && !compact
      ? h('div', { class: 'waiting-fields' },
        h('span', { class: 'waiting-fields-label', text: 'Campos esperados' }),
        h('div', { class: 'waiting-chips' }, fields.map((f) => h('span', { class: 'chip', text: f }))))
      : null,
    action);
}

/** Espaço reservado de um indicador durante a espera. */
export function waitingValue() {
  return h('span', { class: 'waiting-value', title: 'Aguardando a base de dados', text: '—' });
}

/** Tarja permanente do modo demonstração. */
export function demoBanner(onDisable) {
  return h('div', { class: 'demo-banner', role: 'status' },
    h('strong', { text: 'DADOS DE DEMONSTRAÇÃO' }),
    h('span', { text: 'Os números desta tela são fictícios e servem apenas para validar a interface. Não são a produção real da equipe.' }),
    onDisable ? h('button', { class: 'btn btn-ghost btn-sm', onclick: onDisable, text: 'Desligar' }) : null);
}
