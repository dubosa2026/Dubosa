import { money, moneyDelta, number, percent } from './format.js';
import { textIdentifiesOther, identifyingTokens } from './nameScan.js';

/**
 * MOTOR DE MENSAGENS
 * ==================
 *
 * Gera as frases competitivas exibidas ao vendedor. Regras do tom:
 *   - competitivas, enérgicas e provocativas;
 *   - nunca humilhantes: cobram ação, não desqualificam a pessoa;
 *   - NUNCA citam nome, número ou identidade de outro vendedor.
 *
 * A última regra não é confiada à disciplina de quem escreve as frases:
 * `assertNoIdentityLeak` varre o texto gerado e derruba a mensagem se algum
 * nome da equipe aparecer nela.
 */

const TONE = Object.freeze({
  TRIUNFO: 'triunfo',
  DISPUTA: 'disputa',
  RITMO: 'ritmo',
  ALERTA: 'alerta',
  NEUTRO: 'neutro',
});

/**
 * Barreira de privacidade do texto.
 * Segue a mesma regra de `core/nameScan.js`: sobrenome compartilhado não
 * identifica ninguém; nome completo, id ou termo exclusivo, sim.
 *
 * @param {string} text
 * @param {{sellerId:string, sellerName:string}[]} others
 * @param {Set<string>} tokens
 * @returns {boolean} true se o texto está limpo
 */
export function assertNoIdentityLeak(text, others = [], tokens = null) {
  const normalized = Array.isArray(others) && typeof others[0] === 'string'
    ? others.map((name) => ({ sellerId: null, sellerName: name }))
    : others;
  // Sem o conjunto de termos pronto, derivamos aqui: chamar esta função com uma
  // lista de nomes e nenhum contexto não pode resultar numa checagem fraca.
  const effective = tokens && tokens.size
    ? tokens
    : identifyingTokens(normalized.map((o, i) => ({ sellerId: o.sellerId ?? `__${i}`, sellerName: o.sellerName })), null);
  return textIdentifiesOther(text, normalized, effective) === null;
}

/**
 * @param {Object} ctx
 * @param {Object} ctx.performance  saída de metrics.buildPerformance
 * @param {Object} ctx.gaps         saída de ranking.gapsFor (magnitudes apenas)
 * @param {Object} ctx.positions    saída de ranking.positionHistory
 * @param {Object} ctx.tier         saída de gamification.tierFor
 * @param {string} ctx.phase        'antes' | 'aberto' | 'intervalo' | 'encerrado'
 * @param {Object} ctx.config       bloco `messages`
 * @param {Array} ctx.others  colegas, usados só pela barreira de privacidade
 * @param {Set<string>} ctx.identifyingTokens termos que identificam um colega
 * @param {boolean} ctx.awaitingData true quando a base ainda não foi conectada
 * @param {boolean} ctx.temFaturamento false quando a origem informa faturamento
 *   só por carteira. Sem isto, toda frase de dinheiro sai zerada e a disputa
 *   fica muda justamente para quem está produzindo.
 * @returns {Array<{id:string, tone:string, icon:string, text:string, priority:number}>}
 */
export function buildMessages(ctx) {
  const {
    performance, gaps, positions, tier, phase = 'aberto', config = {},
    others = [], identifyingTokens: tokens = new Set(), awaitingData = false,
    temFaturamento = true,
  } = ctx;

  // Sem base conectada não existe desempenho a comentar. Uma frase motivacional
  // aqui seria afirmação sobre um dado que não existe.
  if (awaitingData) {
    return [{
      id: 'aguardando-base',
      tone: 'neutro',
      icon: '⏳',
      text: 'Aguardando a base de dados. Assim que ela for conectada, seu placar e a disputa aparecem aqui.',
      priority: 100,
    }];
  }

  const out = [];
  const push = (id, tone, icon, text, priority) => out.push({ id, tone, icon, text, priority });

  const orders = performance?.orders ?? 0;
  const revenue = performance?.revenue ?? 0;
  const gapAlertRevenue = config.gapAlertRevenue ?? 10000;
  const gapAlertOrders = config.gapAlertOrders ?? 2;

  // --- Liderança e movimento no ranking -----------------------------------
  const gained = positions?.opening != null && positions?.current != null
    ? positions.opening - positions.current
    : 0;

  const produziu = temFaturamento ? revenue > 0 : orders > 0;

  if (gaps?.isLeader && produziu) {
    push('lideranca', TONE.TRIUNFO, '🏆',
      gained > 0 ? 'Você assumiu a liderança. Agora é segurar.' : 'Você está em 1º lugar. Ninguém passou.', 100);
  }

  if (gained > 0) {
    push('subiu', TONE.TRIUNFO, '🔥',
      `Você subiu ${gained === 1 ? 'uma posição' : `${number(gained)} posições`} hoje.`, 95);
  } else if (gained < 0) {
    push('caiu', TONE.ALERTA, '🚨',
      `Você perdeu ${Math.abs(gained) === 1 ? 'uma posição' : `${number(Math.abs(gained))} posições`}. Hora de reagir.`, 93);
  }

  // --- Disputa com os vizinhos (magnitude, nunca identidade) --------------
  if (gaps?.toNext) {
    const { revenue: gapRev, orders: gapOrd } = gaps.toNext;
    if (gapRev > 0 && gapRev <= gapAlertRevenue) {
      push('quase-la', TONE.DISPUTA, '⚔️',
        `A disputa está apertando. Faltam ${money(gapRev)} para avançar.`, 90);
    } else if (gapRev > 0) {
      push('distancia-proxima', TONE.DISPUTA, '🚀',
        `Você está a ${money(gapRev)} da próxima posição.`, 70);
    }
    if (gapOrd > 0 && gapOrd <= gapAlertOrders) {
      push('pedidos-para-avancar', TONE.DISPUTA, '📦',
        `Faltam ${number(gapOrd)} ${gapOrd === 1 ? 'pedido' : 'pedidos'} para avançar.`, 75);
    }
  }

  if (gaps?.toPrevious && gaps.toPrevious.revenue >= 0 && gaps.toPrevious.revenue <= gapAlertRevenue && revenue > 0) {
    push('sendo-alcancado', TONE.ALERTA, '🛡️',
      `Estão a ${money(gaps.toPrevious.revenue)} de você. Segure a posição.`, 85);
  }

  // --- Comparação com o próprio desempenho de ontem ------------------------
  const vsY = performance?.vsYesterdaySameTime;
  const contraOntem = temFaturamento ? vsY?.revenue : vsY?.orders;
  if (contraOntem && contraOntem.baseline > 0) {
    if (contraOntem.abs > 0) {
      const pct = contraOntem.pct != null ? ` (${percent(contraOntem.pct)} acima)` : '';
      push('acima-de-ontem', TONE.RITMO, '🔥',
        `Você está produzindo mais que ontem neste mesmo horário${pct}.`, 80);
    } else if (contraOntem.abs < 0) {
      const atras = temFaturamento
        ? moneyDelta(contraOntem.abs).replace('−', '')
        : `${number(Math.abs(contraOntem.abs))} ${Math.abs(contraOntem.abs) === 1 ? 'pedido' : 'pedidos'}`;
      push('abaixo-de-ontem', TONE.ALERTA, '🚨',
        `Atenção: seu ritmo caiu. Você está ${atras} atrás de ontem neste horário.`, 82);
    }
  }

  // --- Ritmo em relação ao necessário -------------------------------------
  const paceStatus = (temFaturamento
    ? performance?.pace?.revenueStatus
    : performance?.pace?.ordersStatus)?.status;
  if (paceStatus === 'acima') {
    push('ritmo-acima', TONE.RITMO, '🎯', 'Seu ritmo está acima do necessário. Mantenha.', 78);
  } else if (paceStatus === 'no-ritmo') {
    push('ritmo-ok', TONE.RITMO, '🎯', 'Você está no ritmo da meta. Não afrouxe.', 66);
  } else if (paceStatus === 'abaixo') {
    push('ritmo-abaixo', TONE.ALERTA, '⚡', 'Você precisa acelerar o ritmo para alcançar sua projeção.', 84);
  } else if (paceStatus === 'meta-atingida') {
    push('meta-batida', TONE.TRIUNFO, '✅', 'Meta do dia batida. Agora é ampliar a vantagem.', 88);
  }

  // --- Contexto de expediente ---------------------------------------------
  if (phase === 'antes') {
    push('pre-abertura', TONE.NEUTRO, '⏳', 'O expediente ainda não começou. Prepare o dia.', 40);
  } else if (phase === 'encerrado') {
    push('encerrado', TONE.NEUTRO, '🏁', 'Dia encerrado. O placar de amanhã começa zerado.', 40);
  } else if (!produziu) {
    push('sem-producao', TONE.ALERTA, '🚀', 'O dia começou e seu placar está zerado. Abra o marcador.', 92);
  } else if ((performance?.remainingMinutes ?? 0) <= 120 && gaps?.toNext
      && (temFaturamento ? gaps.toNext.revenue > 0 : gaps.toNext.orders > 0)) {
    const falta = temFaturamento
      ? money(gaps.toNext.revenue)
      : `${number(gaps.toNext.orders)} ${gaps.toNext.orders === 1 ? 'pedido' : 'pedidos'}`;
    push('reta-final', TONE.DISPUTA, '⚡',
      `Reta final: ainda dá para virar o jogo. Faltam ${falta}.`, 87);
  }

  // --- Nível ---------------------------------------------------------------
  if (tier?.next && (tier.missingRevenue > 0 || (!temFaturamento && tier.missingOrders > 0))) {
    const falta = temFaturamento
      ? money(tier.missingRevenue)
      : `${number(tier.missingOrders)} ${tier.missingOrders === 1 ? 'pedido' : 'pedidos'}`;
    push('proximo-nivel', TONE.RITMO, '🏅',
      `Faltam ${falta} para o nível ${tier.next.name}.`, 64);
  } else if (tier && !tier.next && produziu) {
    push('nivel-maximo', TONE.TRIUNFO, '👑', `Nível ${tier.current.name} alcançado — o topo da escala.`, 76);
  }

  const clean = out.filter((msg) => assertNoIdentityLeak(msg.text, others, tokens));
  clean.sort((a, b) => b.priority - a.priority);
  return clean.slice(0, config.maxVisible ?? 4);
}
