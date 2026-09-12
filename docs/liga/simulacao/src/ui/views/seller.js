import { h } from '../dom.js';
import {
  statTile, deltaBadge, comparison, progressBar, tierBadge, positionBadge,
  messageList, achievementGrid, pacePanel, sectionTitle, businessClock,
} from '../components/widgets.js';
import { waitingBlock, waitingValue } from '../components/waiting.js';
import { dayChart, dayChartTable } from '../components/chart.js';
import {
  money, number, moneyDelta, numberDelta, percentDelta, ordinal, dateBR, dateLongBR, timeFromMinutes, horaDaLeitura,
} from '../../core/format.js';
import { versaoPublicada, convitePendente } from '../../core/settings.js';
import { comoChamarABase } from '../../core/regua.js';
import { REGRAS } from '../../core/desafios.js';

/**
 * PAINEL DO VENDEDOR
 * ==================
 *
 * Recebe exclusivamente o view model construído por `core/access.js`, que já
 * passou pelas três barreiras de privacidade. Esta tela não tem acesso ao
 * estado da equipe e, por construção, não teria como exibir o dado de um colega
 * mesmo se alguém tentasse.
 */

export function sellerView({ vm, config, app }) {
  // "Aguardando" é só quando a BASE não está conectada. Vendedor zerado com a
  // base no ar tem placar, posição e disputa reais — ele não some da liga.
  const awaiting = vm.awaitingData;

  if (app.state.compact) return compactView({ vm, app, awaiting });

  return h('div', { class: 'view view-seller' },
    header({ vm, app }),
    faixaDeInstalacao({ app }),
    heroSection({ vm, awaiting }),
    vm.messages.length ? h('section', { class: 'card card-messages' }, messageList(vm.messages)) : null,
    desafioSection({ vm, awaiting }),
    disputeSection({ vm, awaiting }),
    comparisonSection({ vm, awaiting }),
    projectionSection({ vm, awaiting, config }),
    h('section', { class: 'card' },
      sectionTitle('Ritmo de produção'),
      awaiting
        ? waitingBlock({ compact: true, title: 'Sem ritmo para medir', detail: 'O ritmo é calculado sobre os pedidos e o faturamento do dia.' })
        : pacePanel(vm.performance, { temFaturamento: vm.revenueAvailable })),
    chartSection({ vm, config, app, awaiting }),
    tierSection({ vm, awaiting }),
    h('section', { class: 'card' },
      sectionTitle('Conquistas do dia'),
      awaiting
        ? waitingBlock({ compact: true, title: 'Conquistas aguardando', detail: 'As conquistas do dia dependem da base de dados.' })
        : achievementGrid(vm.achievements)),
    coletivoSection({ vm, awaiting }),
    teamSection({ vm, awaiting }),
    footer({ vm, app }));
}

// ---------------------------------------------------------------- cabeçalho
/**
 * Convite de instalação, na tela de quem vai instalar.
 *
 * O caminho anterior era um arquivo enviado por WhatsApp, baixado,
 * descompactado e executado — quatro passos, cada um com sua chance de dar
 * errado, e nenhum aviso quando dava. Aqui é um botão, na tela que a pessoa já
 * abriu, e quem instala é o próprio navegador: janela própria, ícone na área
 * de trabalho, sem barra de endereços.
 *
 * Só aparece quando o navegador oferece — e some sozinho depois de instalado.
 */
function faixaDeInstalacao({ app }) {
  if (!convitePendente() || app.state.instalacaoDispensada) return null;
  return h('div', { class: 'alert alert-info install-strip' },
    h('span', { class: 'install-icon', 'aria-hidden': 'true', text: '📌' }),
    h('div', { class: 'install-text' },
      h('strong', { text: 'Deixe o placar sempre à mão. ' }),
      'Vira um aplicativo com ícone próprio, numa janela pequena e sem barra de endereços.'),
    h('div', { class: 'button-row' },
      h('button', {
        class: 'btn btn-primary btn-sm',
        onclick: async (e) => { e.currentTarget.disabled = true; await app.instalar(); },
        text: 'Instalar',
      }),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => app.dispensarInstalacao(),
        text: 'Agora não',
      })));
}

function header({ vm, app }) {
  return h('header', { class: 'app-header' },
    h('div', { class: 'app-header-main' },
      h('div', { class: 'app-title' },
        h('span', { class: 'app-name', text: vm.identity.sellerName ?? 'Vendedor' }),
        vm.awaitingData ? null : tierBadge(vm.tier)),
      h('div', { class: 'app-subtitle', text: dateLongBR(vm.date) })),
    h('div', { class: 'app-header-side' },
      businessClock({
        phase: vm.phase,
        elapsedMinutes: vm.performance.elapsedMinutes,
        remainingMinutes: vm.performance.remainingMinutes,
        atMinutes: vm.atMinutes,
      }),
      h('button', {
        class: 'btn btn-ghost btn-sm', title: 'Modo compacto (janela pequena)',
        onclick: () => app.toggleCompact(), text: '▭ Compacto',
      })));
}

// -------------------------------------------------------------------- herói
/**
 * A MANCHETE É "VOCÊ CONTRA VOCÊ".
 *
 * Até aqui a primeira frase da tela era a posição no ranking. Ela dizia a
 * verdade e, ainda assim, era a frase errada para começar o dia: metade da
 * equipe abria o aplicativo para ler que estava atrás, e a distância que separa
 * o oitavo do sétimo não depende só do oitavo.
 *
 * A manchete passa a ser a régua pessoal — a única disputa que a pessoa ganha
 * ou perde sozinha. A posição continua na tela, na linha de baixo, porque ela
 * existe e esconder dado não é privacidade; mas deixa de ser a primeira coisa
 * que alguém lê sobre o próprio dia.
 */
function manchete({ vm, awaiting }) {
  if (awaiting) {
    return { icone: '⏳', texto: 'Aguardando a base de dados.', apoio: 'Seu placar aparece assim que ela for conectada.', tom: 'neutro' };
  }
  const cmp = vm.contraMim;
  const base = comoChamarABase(cmp);
  const temFat = vm.revenueAvailable;
  const quanto = (n) => (temFat
    ? money(Math.abs(n))
    : `${number(Math.abs(n))} ${Math.abs(n) === 1 ? 'pedido' : 'pedidos'}`);

  if (!cmp || cmp.estado === 'sem-regua') {
    return {
      icone: '📐',
      texto: vm.semProducao ? 'Seu placar de hoje começa aqui.' : 'Sua régua pessoal está se formando.',
      apoio: 'A partir dos próximos dias, seu adversário passa a ser o seu próprio histórico — e mais ninguém.',
      tom: 'neutro',
    };
  }
  if (cmp.estado === 'acima') {
    return {
      icone: '📈',
      texto: `Você está ${quanto(cmp.diferenca)} acima da ${base}.`,
      apoio: 'Hoje você está melhor do que você. É isso que conta.',
      tom: 'bom',
    };
  }
  if (cmp.estado === 'igual') {
    return {
      icone: '📐',
      texto: `Você está exatamente na ${base}.`,
      apoio: 'O próximo pedido passa dela.',
      tom: 'neutro',
    };
  }
  const falta = Math.abs(cmp.diferenca);
  return {
    icone: '🎯',
    texto: `${!temFat && falta === 1 ? 'Falta' : 'Faltam'} ${quanto(cmp.diferenca)} para alcançar a ${base}.`,
    apoio: 'É a sua própria marca. Ela já foi alcançada antes.',
    tom: 'alvo',
  };
}

/**
 * A RÉGUA, DESENHADA.
 *
 * Duas quantidades e uma barra: onde a própria média estava neste horário e
 * onde a pessoa está agora. Nenhuma referência a terceiros — nem anônima.
 */
function reguaStrip({ vm, awaiting }) {
  const cmp = vm.contraMim;
  if (awaiting || !cmp || cmp.estado === 'sem-regua') return null;
  const temFat = vm.revenueAvailable;
  const marca = temFat ? cmp.marca.revenue : cmp.marca.orders;
  const meu = temFat ? vm.performance.revenue : vm.performance.orders;
  const fmt = (n) => (temFat ? money(n) : `${number(Math.round(n * 10) / 10)}`);
  // Um quarto de folga no fim da barra. Sem ela, quem está um pedido à frente
  // aparece com a barra cheia até a borda — a mesma imagem de quem fechou o dia.
  const teto = Math.max(marca, meu, 1) * 1.25;

  return h('div', { class: 'regua' },
    h('div', { class: 'regua-track' },
      h('div', { class: ['regua-fill', meu >= marca ? 'regua-acima' : 'regua-abaixo'], style: { width: `${Math.min(100, (meu / teto) * 100)}%` } }),
      h('div', { class: 'regua-marca', style: { left: `${Math.min(100, (marca / teto) * 100)}%` }, title: 'sua própria marca neste horário' })),
    h('div', { class: 'regua-legend' },
      h('span', { class: 'regua-item' },
        h('span', { class: 'regua-key', text: 'Você agora' }),
        h('span', { class: 'regua-val strong', text: temFat ? fmt(meu) : `${fmt(meu)} ${meu === 1 ? 'pedido' : 'pedidos'}` })),
      h('span', { class: 'regua-item' },
        h('span', { class: 'regua-key', text: `${maiuscula(comoChamarABase(cmp))} às ${timeFromMinutes(vm.atMinutes)}` }),
        h('span', { class: 'regua-val', text: temFat ? fmt(marca) : `${fmt(marca)} ${marca === 1 ? 'pedido' : 'pedidos'}` }))),
    h('p', { class: 'regua-fonte', text: fonteDaRegua(cmp) }));
}

/** De onde a régua saiu — dito sempre, para o número não parecer oráculo. */
function fonteDaRegua(cmp) {
  switch (cmp.base) {
    case 'dia-da-semana': {
      // "das suas últimas 4 quintas", mas "dos seus últimos 4 sábados": os
      // dias da semana são femininos e o fim de semana é masculino.
      const masculino = cmp.nomeDoDia === 'sábado' || cmp.nomeDoDia === 'domingo';
      return masculino
        ? `Média dos seus últimos ${cmp.amostras} ${cmp.nomeDoDia}s, desde ${dateBR(cmp.desde)}.`
        : `Média das suas últimas ${cmp.amostras} ${cmp.nomeDoDia}s, desde ${dateBR(cmp.desde)}.`;
    }
    case 'dias-uteis':
      return `Média dos seus últimos ${cmp.amostras} dias de trabalho, desde ${dateBR(cmp.desde)}. Com mais semanas de histórico, ela passa a comparar ${cmp.nomeDoDia} com ${cmp.nomeDoDia}.`;
    case 'ultimo-dia':
      return `Ainda há um único dia anterior na base (${dateBR(cmp.desde)}). A média se forma nos próximos.`;
    default:
      return '';
  }
}

function maiuscula(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
}

function heroSection({ vm, awaiting }) {
  const delta = vm.positions.opening != null && vm.positions.current != null
    ? vm.positions.opening - vm.positions.current
    : 0;
  const m = manchete({ vm, awaiting });

  return h('section', { class: 'card card-hero' },
    h('div', { class: ['hero-head', `hero-${m.tom}`] },
      h('span', { class: 'hero-icon', 'aria-hidden': 'true', text: m.icone }),
      h('div', { class: 'hero-head-text' },
        h('span', { class: 'hero-headline', text: m.texto }),
        h('span', { class: 'hero-apoio', text: m.apoio }))),
    reguaStrip({ vm, awaiting }),
    // A posição continua aqui — em letra pequena, ao lado do que importa mais.
    h('div', { class: 'hero-rank' },
      positionBadge(awaiting ? null : vm.gaps?.position, vm.gaps?.total, { delta }),
      h('span', { class: 'hero-rank-text', text: awaiting
        ? 'Posição indisponível até a base ser conectada.'
        : vm.gaps?.isLeader
          ? 'Na liderança da equipe hoje.'
          : `${ordinal(vm.gaps?.position)} lugar${vm.gaps?.total ? ` entre ${number(vm.gaps.total)}` : ''} hoje.` }),
      // Em texto discreto, não num selo vermelho: posição perdida de manhã é
      // quase sempre agitação do começo do dia, e um alarme aqui roubaria a
      // leitura da manchete, que é justamente o que esta tela quis mudar.
      delta !== 0 && !awaiting
        ? h('span', { class: 'hero-rank-move', text: `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'posição' : 'posições'} ${delta > 0 ? 'ganhas' : 'perdidas'} hoje` })
        : null),
    h('div', { class: 'hero-stats' },
      statTile({
        label: 'Pedidos hoje',
        value: awaiting ? '—' : number(vm.performance.orders),
        hero: true,
        icon: '📦',
        sub: awaiting ? waitingValue() : comparison(vm.performance.vsYesterdaySameTime.orders, 'orders'),
      }),
      vm.revenueAvailable
        ? statTile({
          label: 'Faturamento hoje',
          value: awaiting ? '—' : money(vm.performance.revenue),
          hero: true,
          icon: '💰',
          sub: awaiting ? waitingValue() : comparison(vm.performance.vsYesterdaySameTime.revenue, 'revenue'),
        })
        : statTile({
          label: 'Faturamento hoje',
          value: '—',
          hero: true,
          icon: '💰',
          title: 'A origem dos dados informa faturamento por carteira, não por vendedor.',
          sub: h('span', { class: 'muted', text: 'não informado pela origem' }),
        })));
}

// ------------------------------------------------------------------ disputa
function disputeSection({ vm, awaiting }) {
  if (awaiting) {
    return h('section', { class: 'card' },
      sectionTitle('A disputa'),
      waitingBlock({ compact: true, title: 'Sem disputa para mostrar ainda', detail: 'As distâncias para as posições vizinhas aparecem quando a base for conectada.' }));
  }
  const next = vm.gaps?.toNext;
  const prev = vm.gaps?.toPrevious;

  return h('section', { class: 'card card-dispute' },
    sectionTitle('A disputa'),
    h('div', { class: 'dispute-grid' },
      h('div', { class: 'dispute-box dispute-up' },
        h('div', { class: 'dispute-label' }, h('span', { 'aria-hidden': 'true', text: '⬆' }), 'Para avançar uma posição'),
        next && !vm.revenueAvailable
          ? h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: next.orders > 0 ? `${number(next.orders)} ${next.orders === 1 ? 'pedido' : 'pedidos'}` : 'Empate' }),
            h('span', { class: 'dispute-sub', text: next.orders > 0 ? 'é o que falta para passar' : 'o próximo pedido decide' }))
          : next
          ? h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: next.revenue > 0 ? money(next.revenue) : 'Empate' }),
            next.revenue > 0
              ? (next.orders > 0
                ? h('span', { class: 'dispute-sub', text: `ou ${number(next.orders)} ${next.orders === 1 ? 'pedido' : 'pedidos'} a mais` })
                : h('span', { class: 'dispute-sub', text: 'em pedidos você não está atrás — falta faturamento' }))
              : h('span', { class: 'dispute-sub', text: 'faturamento empatado — o próximo pedido decide' }))
          : h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: '🏆' }),
            h('span', { class: 'dispute-sub', text: 'Você está em 1º. Não há posição acima.' }))),
      h('div', { class: 'dispute-box dispute-down' },
        h('div', { class: 'dispute-label' }, h('span', { 'aria-hidden': 'true', text: '⬇' }), 'Vantagem sobre quem vem atrás'),
        prev && !vm.revenueAvailable
          ? h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: prev.orders > 0 ? `${number(prev.orders)} ${prev.orders === 1 ? 'pedido' : 'pedidos'}` : 'Empate' }),
            h('span', { class: 'dispute-sub', text: prev.orders > 0 ? 'de vantagem' : 'estão colados em você' }))
          : prev
          ? h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: prev.revenue > 0 ? money(prev.revenue) : 'Empate' }),
            h('span', { class: 'dispute-sub', text: prev.revenue > 0
              ? (prev.orders > 0 ? `e ${number(prev.orders)} ${prev.orders === 1 ? 'pedido' : 'pedidos'} de vantagem` : 'vantagem só em faturamento')
              : 'estão colados em você — não deixe passar' }))
          : h('div', { class: 'dispute-values' },
            h('span', { class: 'dispute-main', text: '—' }),
            h('span', { class: 'dispute-sub', text: 'Você está na última posição. Só há caminho para cima.' })))),
    h('p', { class: 'privacy-note' },
      h('span', { 'aria-hidden': 'true', text: '🔒' }),
      'Você vê a distância, nunca quem está na outra posição. O mesmo vale para os demais em relação a você.'));
}

// --------------------------------------------------- comparação com ontem
function comparisonSection({ vm, awaiting }) {
  const o = vm.performance.vsYesterdaySameTime.orders;
  const r = vm.performance.vsYesterdaySameTime.revenue;
  const hasBaseline = !r.semBase && (r.baseline > 0 || o.baseline > 0);
  // Sem faturamento por vendedor, esta linha imprimia "R$ 0" em hoje, em ontem
  // e na diferença — três vezes a afirmação de que a pessoa não vendeu nada,
  // quando o que houve é que a origem não informa o valor dela.
  const temFaturamento = vm.revenueAvailable;

  return h('section', { class: 'card' },
    sectionTitle(`Comparação com ontem às ${timeFromMinutes(vm.atMinutes)}`),
    awaiting
      ? waitingBlock({ compact: true, title: 'Sem comparação disponível', detail: 'A comparação com o dia anterior depende da base de dados.' })
      : !hasBaseline
        ? h('p', { class: 'muted', text: r.semBase
          ? 'Ainda não há registro do dia anterior para comparar. A partir do segundo dia de uso, esta comparação aparece aqui.'
          : 'Ainda não há produção registrada no dia anterior neste horário para comparar.' })
        : h('div', { class: 'table-scroll' },
          h('table', { class: 'data-table compare-table' },
            h('thead', {}, h('tr', {},
              h('th', { text: '' }),
              h('th', { class: 'num', text: 'Hoje' }),
              h('th', { class: 'num', text: 'Ontem' }),
              h('th', { class: 'num', text: 'Diferença' }))),
            h('tbody', {},
              h('tr', {},
                h('td', { text: 'Pedidos' }),
                h('td', { class: 'num strong', text: number(o.current) }),
                h('td', { class: 'num', text: number(o.baseline) }),
                h('td', { class: 'num' }, h('span', { class: 'comparison comparison-end' },
                  deltaBadge(o.direction, numberDelta(o.abs), { size: 'sm' }),
                  o.pct === null ? null : h('span', { class: 'comparison-pct', text: percentDelta(o.pct) })))),
              temFaturamento
                ? h('tr', {},
                  h('td', { text: 'Faturamento' }),
                  h('td', { class: 'num strong', text: money(r.current) }),
                  h('td', { class: 'num', text: money(r.baseline) }),
                  h('td', { class: 'num' }, h('span', { class: 'comparison comparison-end' },
                    deltaBadge(r.direction, moneyDelta(r.abs), { size: 'sm' }),
                    r.pct === null ? null : h('span', { class: 'comparison-pct', text: percentDelta(r.pct) }))))
                : null))));
}

// ---------------------------------------------------------------- projeção
function projectionSection({ vm, awaiting, config }) {
  const p = vm.performance.projection;
  const temFaturamento = vm.revenueAvailable;
  // Sem faturamento na origem o modelo de faturamento é sempre 'sem-producao',
  // e a tela dizia "sem produção registrada até agora" ao lado de treze
  // pedidos. Quem manda na leitura é o modelo do indicador que existe.
  const modelo = temFaturamento ? p.revenueModel : p.ordersModel;
  const waitingPace = modelo === 'aguardando';

  return h('section', { class: 'card' },
    sectionTitle('Projeção de fechamento', h('span', {
      class: 'section-hint',
      text: `expediente até ${config.businessHours?.end ?? '18:00'}`,
    })),
    awaiting
      ? waitingBlock({ compact: true, title: 'Sem projeção', detail: 'A projeção é calculada a partir da produção do dia.' })
      : waitingPace
        ? h('p', { class: 'muted', text: 'Ainda é cedo para projetar. A projeção começa depois dos primeiros minutos de expediente, para não extrapolar ruído.' })
        : h('div', { class: 'projection-grid' },
          statTile({
            label: 'Pedidos projetados', icon: '📦',
            value: p.orders === null ? '—' : number(p.orders),
            sub: h('span', { class: 'muted', text: `realizado: ${number(vm.performance.orders)}` }),
          }),
          temFaturamento
            ? statTile({
              label: 'Faturamento projetado', icon: '💰',
              value: p.revenue === null ? '—' : money(p.revenue),
              sub: h('span', { class: 'muted', text: `realizado: ${money(vm.performance.revenue)}` }),
            })
            : statTile({
              label: 'Faturamento projetado', icon: '💰',
              value: '—',
              sub: h('span', { class: 'muted', text: 'não informado pela origem' }),
            })),
    !awaiting && !waitingPace
      ? h('p', { class: 'projection-note', text: projectionNote(modelo) })
      : null);
}

function projectionNote(model) {
  switch (model) {
    case 'blend': return 'Projeção combinando o ritmo de hoje com a curva do dia anterior.';
    case 'curve': return 'Projeção baseada na forma do dia anterior.';
    case 'linear-fallback': return 'Projeção pelo ritmo atual — ainda não há dia anterior comparável.';
    case 'sem-producao': return 'Sem produção registrada até agora.';
    default: return 'Projeção pelo ritmo atual.';
  }
}

// ----------------------------------------------------------------- gráfico
function chartSection({ vm, config, app, awaiting }) {
  // Sem faturamento na origem não há curva de faturamento para desenhar, e a
  // preferência guardada abriria o gráfico numa aba permanentemente vazia.
  const temFaturamento = vm.revenueAvailable;
  const metric = temFaturamento ? app.state.metric : 'orders';
  const toggle = temFaturamento
    ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Indicador do gráfico' },
      h('button', {
        class: ['seg-btn', metric === 'revenue' && 'seg-on'],
        onclick: () => app.setMetric('revenue'), text: 'Faturamento',
      }),
      h('button', {
        class: ['seg-btn', metric === 'orders' && 'seg-on'],
        onclick: () => app.setMetric('orders'), text: 'Pedidos',
      }))
    : h('span', { class: 'section-hint', text: 'pedidos' });

  const semCurvaPropria = !vm.charts.mine.length;
  const body = awaiting
    ? waitingBlock({ compact: true, title: 'Sem curva para desenhar', detail: 'O gráfico aparece quando a base de dados for conectada.' })
    : semCurvaPropria && !vm.charts.yesterday.length
      ? h('p', { class: 'muted', text: 'Nenhum pedido registrado hoje e nenhum registro de ontem para comparar. Sua linha começa no primeiro pedido.' })
      : app.state.chartAsTable
      ? dayChartTable({ today: vm.charts.mine, yesterday: vm.charts.yesterday, metric })
      : dayChart({
        today: vm.charts.mine,
        yesterday: vm.charts.yesterday,
        metric,
        businessHours: config.businessHours,
        nowMinutes: vm.atMinutes,
        labelToday: 'Hoje',
        labelYesterday: 'Ontem',
      });

  const aviso = awaiting
    ? null
    : semCurvaPropria && vm.charts.yesterday.length
      ? h('p', { class: 'muted', text: 'Sua linha de hoje ainda não começou. A curva pontilhada é a de ontem — é ela que você precisa passar.' })
      : vm.charts.mine.length === 1
        ? h('p', { class: 'muted', text: 'Só há uma medição hoje — por isso o ponto solto. A curva aparece conforme o dia é atualizado.' })
        : null;

  return h('section', { class: 'card' },
    sectionTitle('Evolução no dia', toggle),
    h('div', { class: 'legend' },
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-today' }), 'Hoje'),
      h('span', { class: 'legend-item' }, h('span', { class: 'legend-swatch legend-yesterday' }), 'Ontem'),
      h('button', {
        class: 'btn btn-ghost btn-sm legend-table-btn',
        onclick: () => app.toggleChartTable(),
        text: app.state.chartAsTable ? 'Ver gráfico' : 'Ver tabela',
      })),
    aviso,
    body);
}

// -------------------------------------------------------------------- nível
function tierSection({ vm, awaiting }) {
  const t = vm.tier;
  if (awaiting) {
    return h('section', { class: 'card' },
      sectionTitle('Nível do dia'),
      waitingBlock({ compact: true, title: 'Nível indefinido', detail: 'O nível do dia depende dos pedidos e do faturamento realizados.' }));
  }
  return h('section', { class: 'card' },
    sectionTitle('Nível do dia', tierBadge(t, { size: 'lg' })),
    t.next
      ? progressBar({
        value: t.progress,
        label: `Rumo a ${t.next.name}`,
        caption: faltaParaONivel(t),
      })
      : h('p', { class: 'muted', text: 'Nível máximo da escala alcançado hoje.' }),
    h('div', { class: 'tier-scale' }, (vm.tier.total ? Array.from({ length: vm.tier.total }) : []).map((_, i) => h('span', {
      class: ['tier-step', i <= vm.tier.index && 'tier-step-on'],
      'aria-hidden': 'true',
    }))));
}

/** O que falta para a próxima posição, no indicador que está valendo. */
function faltaParaAvancar(gap, temFaturamento) {
  const valor = temFaturamento ? gap.revenue : gap.orders;
  if (!(valor > 0)) return 'Empate na próxima posição';
  return temFaturamento
    ? `${money(gap.revenue)} para avançar`
    : `${number(gap.orders)} ${gap.orders === 1 ? 'pedido' : 'pedidos'} para avançar`;
}

/** O que ainda falta para o próximo nível, dito só com o que a base informa. */
function faltaParaONivel(t) {
  const pedidos = t.missingOrders > 0
    ? `${number(t.missingOrders)} ${t.missingOrders === 1 ? 'pedido' : 'pedidos'}`
    : null;
  // `missingRevenue` vem nulo quando a origem não informa faturamento por
  // vendedor. Zero ali seria lido como "já alcançou".
  const reais = t.missingRevenue > 0 ? money(t.missingRevenue) : null;
  if (!reais && !pedidos) return 'Nível alcançado.';
  return `Faltam ${[reais, pedidos].filter(Boolean).join(' e ')}.`;
}

// --------------------------------------------------- desafio do gestor
/**
 * O DESAFIO — SEMPRE CONTRA O PRÓPRIO HISTÓRICO.
 *
 * Fica separado do quadro de conquistas de propósito: conquista é permanente e
 * igual para todo mundo; desafio tem autor, prazo e acaba. Misturar os dois
 * apagaria a diferença que faz o desafio funcionar — ele é o que está valendo
 * AGORA.
 *
 * O resultado da equipe aparece como contagem. Nunca uma lista, nunca uma
 * ordem: ninguém descobre aqui quem cumpriu e quem não cumpriu.
 */
function desafioSection({ vm, awaiting }) {
  const d = vm.desafio;
  if (!d) return null;

  const meu = d.meu;
  const prazo = d.diasRestantes;
  const unidade = REGRAS[d.regra]?.unidade ?? 'pedidos';

  return h('section', { class: ['card', 'card-desafio', meu?.cumprido && 'card-desafio-ok'] },
    sectionTitle(`Desafio: ${d.titulo}`, h('span', {
      class: 'section-hint',
      text: prazo === null ? '' : prazo <= 0 ? 'último dia' : `${prazo} ${prazo === 1 ? 'dia' : 'dias'} restantes`,
    })),
    h('p', { class: 'desafio-regra' },
      h('span', { 'aria-hidden': 'true', text: '🎯 ' }),
      d.frase),
    awaiting || !meu
      ? waitingBlock({ compact: true, title: 'Desafio aguardando a base', detail: 'O progresso é medido sobre a produção do dia.' })
      : meu.semRegua
        ? h('p', { class: 'muted', text: meu.detalhe })
        : h('div', {},
          progressBar({
            value: meu.progresso,
            label: meu.cumprido ? 'Cumprido' : 'Seu progresso',
            caption: meu.cumprido
              ? `Você ${unidade === 'dias' ? 'já somou' : 'já está'} ${number(meu.feito)} ${unidade === 'dias' ? (meu.feito === 1 ? 'dia' : 'dias') : (meu.feito === 1 ? 'pedido acima' : 'pedidos acima')} — alvo de ${number(meu.alvo)}.`
              : `${number(meu.feito)} de ${number(meu.alvo)} ${unidade}. ${meu.detalhe}`,
            tone: meu.cumprido ? 'good' : 'accent',
          })),
    d.equipe && d.equipe.de > 0
      ? h('p', { class: 'desafio-equipe' },
        h('span', { 'aria-hidden': 'true', text: '👥 ' }),
        `${number(d.equipe.n)} de ${number(d.equipe.de)} já cumpriram este desafio.`,
        d.equipe.meta && d.equipe.meta !== d.equipe.de
          ? h('span', { class: 'muted', text: ` Meta da equipe: ${number(d.equipe.meta)}.` })
          : null)
      : null,
    h('p', { class: 'privacy-note' },
      h('span', { 'aria-hidden': 'true', text: '🔒' }),
      'Cada um disputa com o próprio histórico. A contagem da equipe não diz quem é quem.'));
}

// ------------------------------------------------- a equipe contra ela mesma
/**
 * "X DE N SUPERARAM A PRÓPRIA MARCA HOJE."
 *
 * A única frase sobre os colegas que esta tela produz — e ela é exatamente a
 * mesma na tela de todos. Não há nome, não há posição, não há ordem; nem quem
 * está dentro da contagem descobre quem mais está.
 *
 * O que ela acrescenta é o que faltava no desenho: sem alguma coisa coletiva, a
 * régua pessoal deixaria vinte e duas pessoas correndo cada uma no seu quarto.
 * Aqui todo mundo empurra o mesmo número, e ninguém precisa perder para o
 * número subir.
 */
function coletivoSection({ vm, awaiting }) {
  if (!vm.team.visible) return null;
  const c = vm.coletivo;

  if (awaiting) {
    return h('section', { class: 'card' },
      sectionTitle('A equipe contra ela mesma'),
      waitingBlock({ compact: true, title: 'Contagem aguardando', detail: 'Ela depende da base de dados do dia.' }));
  }
  if (!c || c.de < 3) {
    return h('section', { class: 'card card-muted' },
      sectionTitle('A equipe contra ela mesma'),
      h('p', { class: 'muted', text: 'A contagem aparece quando pelo menos três pessoas tiverem régua própria formada. '
        + 'Com menos gente do que isso, uma contagem começaria a revelar resultado individual.' }));
  }

  return h('section', { class: 'card card-coletivo' },
    sectionTitle('A equipe contra ela mesma', h('span', { class: 'section-hint', text: 'igual para todos' })),
    progressBar({
      value: c.fracao,
      label: `${number(c.n)} de ${number(c.de)} superaram a própria marca hoje`,
      caption: c.n === 0
        ? 'Ninguém passou da própria marca ainda. O primeiro a passar move este número.'
        : c.n === c.de
          ? 'Todo mundo com régua formada está acima da própria marca hoje.'
          : `Faltam ${number(c.de - c.n)} para que a equipe inteira esteja acima da própria marca.`,
      tone: c.fracao >= 0.5 ? 'good' : 'accent',
    }),
    c.semRegua > 0
      ? h('p', { class: 'muted', text: `${number(c.semRegua)} ${c.semRegua === 1 ? 'pessoa ainda não tem' : 'pessoas ainda não têm'} histórico suficiente para ter régua. `
        + 'Elas entram na contagem assim que tiverem.' })
      : null,
    h('p', { class: 'privacy-note' },
      h('span', { 'aria-hidden': 'true', text: '🔒' }),
      'Uma contagem, e só. Quem está dentro dela não é dito a ninguém — nem a quem está dentro.'));
}

// ------------------------------------------------------------------ equipe
function teamSection({ vm, awaiting }) {
  if (!vm.team.visible) {
    return h('section', { class: 'card card-muted' },
      sectionTitle('Resultado geral da equipe'),
      vm.team.reason === 'aguardando-base'
        ? waitingBlock({ compact: true, title: 'Totais aguardando', detail: 'O resultado geral da equipe aparece quando a base de dados for conectada.' })
        : h('p', { class: 'muted', text: vm.team.reason === 'equipe-pequena'
          ? 'O total da equipe fica oculto quando há poucos vendedores ativos: com um grupo pequeno, uma soma revelaria o número individual de alguém.'
          : 'A exibição do total da equipe está desativada na configuração.' }));
  }
  return h('section', { class: 'card' },
    sectionTitle('Resultado geral da equipe', h('span', { class: 'section-hint', text: 'somente totais' })),
    awaiting
      ? waitingBlock({ compact: true, title: 'Sem totais ainda', detail: 'Os totais da equipe dependem da base de dados.' })
      : h('div', {}, h('div', { class: 'team-grid' },
        statTile({ label: 'Pedidos da equipe', value: number(vm.team.orders), icon: '📦' }),
        statTile({
          label: 'Faturamento da equipe', icon: '💰',
          value: vm.revenueAvailable || vm.team.revenueInformadaPelaOrigem ? money(vm.team.revenue) : '—',
          sub: vm.revenueAvailable
            ? null
            : h('span', { class: 'muted', text: vm.team.revenueInformadaPelaOrigem
              ? 'total da carteira'
              : 'não informado pela origem' }),
        }),
        statTile({ label: 'Vendedores ativos', value: `${number(vm.team.activeCount)} de ${number(vm.team.sellerCount)}`, icon: '👥' }),
        // A fatia é faturamento individual em forma de porcentagem. Sem o
        // numerador, o quadro ficava na tela com um traço dentro — ocupando
        // espaço para não dizer nada.
        vm.team.myShareOfRevenue === null
          ? null
          : statTile({
            label: 'Sua fatia do faturamento',
            value: `${Math.round(vm.team.myShareOfRevenue * 100)}%`,
            icon: '🎯',
          })),
      h('p', { class: 'privacy-note' },
        h('span', { 'aria-hidden': 'true', text: '🔒' }),
        'Apenas somas da equipe. Nenhum resultado individual de colega é exibido aqui.')));
}

// ------------------------------------------------------------------ rodapé
function footer({ vm, app }) {
  return h('footer', { class: 'app-footer' },
    h('span', { class: 'muted' },
      // A hora do relógio não diz nada sobre o placar: com o coletor parado, um
      // número de horas atrás tem a mesma cara de um número de agora.
      vm.lidaEm ? `Base lida às ${horaDaLeitura(vm.lidaEm)}` : `Atualizado às ${timeFromMinutes(vm.atMinutes)}`,
      versaoPublicada() ? h('span', { class: 'versao', title: 'Versão publicada deste aplicativo', text: ` · v${versaoPublicada()}` }) : null),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.refresh(), text: '↻ Atualizar' }),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.logout(), text: 'Sair' }));
}

// ---------------------------------------------------------- modo compacto
function compactView({ vm, app, awaiting }) {
  const next = vm.gaps?.toNext;
  const paceStatus = (vm.revenueAvailable
    ? vm.performance.pace?.revenueStatus
    : vm.performance.pace?.ordersStatus)?.status;
  const top = vm.messages[0] ?? null;

  return h('div', { class: 'view view-compact' },
    h('div', { class: 'compact-bar' },
      h('span', { class: 'compact-name', text: vm.identity.sellerName ?? '' }),
      h('button', {
        class: 'btn btn-ghost btn-xs', title: 'Voltar ao painel completo',
        onclick: () => app.toggleCompact(), text: '⛶',
      })),
    // Na janela pequena o espaço é do que a pessoa controla: a produção dela e
    // a distância para a própria marca. A posição continua, uma linha abaixo.
    h('div', { class: 'compact-position' },
      h('span', { class: 'compact-pos-value', text: awaiting ? '—' : number(vm.performance.orders) }),
      h('span', { class: 'compact-pos-label', text: vm.performance.orders === 1 ? 'pedido hoje' : 'pedidos hoje' })),
    compactRegua({ vm, awaiting }),
    h('div', { class: 'compact-stats' },
      h('div', { class: 'compact-stat' },
        h('span', { class: 'compact-stat-label', text: 'Posição' }),
        h('span', { class: 'compact-stat-value', text: awaiting ? '—' : ordinal(vm.gaps?.position) })),
      vm.revenueAvailable
        ? h('div', { class: 'compact-stat' },
          h('span', { class: 'compact-stat-label', text: 'Faturamento' }),
          h('span', { class: 'compact-stat-value', text: awaiting ? '—' : money(vm.performance.revenue) }))
        : h('div', { class: 'compact-stat' },
          h('span', { class: 'compact-stat-label', text: 'Nível' }),
          h('span', { class: 'compact-stat-value', text: awaiting ? '—' : (vm.tier?.current?.name ?? '—') }))),
    !awaiting && next
      ? h('div', { class: 'compact-gap' },
        h('span', { 'aria-hidden': 'true', text: '⚔️' }),
        h('span', { text: faltaParaAvancar(next, vm.revenueAvailable) }))
      : null,
    !awaiting && paceStatus
      ? h('div', { class: ['compact-pace', paceStatus === 'abaixo' || paceStatus === 'parado' ? 'tone-warn' : 'tone-good'] },
        h('span', { 'aria-hidden': 'true', text: paceStatus === 'abaixo' || paceStatus === 'parado' ? '⚡' : '🎯' }),
        h('span', { text: paceStatus === 'abaixo' ? 'Acelere o ritmo' : paceStatus === 'parado' ? 'Placar zerado' : 'Ritmo em dia' }))
      : null,
    top ? h('div', { class: 'compact-message', text: `${top.icon} ${top.text}` }) : null,
    awaiting ? h('div', { class: 'compact-waiting', text: '⏳ Aguardando a base de dados' }) : null,
    h('div', { class: 'compact-footer' },
      h('span', { class: 'muted', text: timeFromMinutes(vm.atMinutes) }),
      h('button', { class: 'btn btn-ghost btn-xs', onclick: () => app.refresh(), text: '↻' })));
}

/** A régua, do tamanho de um cronômetro. */
function compactRegua({ vm, awaiting }) {
  const cmp = vm.contraMim;
  if (awaiting || !cmp || cmp.estado === 'sem-regua') return null;
  const temFat = vm.revenueAvailable;
  const d = Math.abs(cmp.diferenca);
  const quanto = temFat ? money(d) : `${number(d)} ${d === 1 ? 'pedido' : 'pedidos'}`;
  const texto = cmp.estado === 'acima'
    ? `${quanto} acima da sua marca`
    : cmp.estado === 'igual'
      ? 'na sua própria marca'
      : `${quanto} para a sua marca`;
  return h('div', { class: ['compact-regua', cmp.estado === 'abaixo' ? 'tone-warn' : 'tone-good'] },
    h('span', { 'aria-hidden': 'true', text: cmp.estado === 'acima' ? '📈' : '🎯' }),
    h('span', { text: texto }));
}
