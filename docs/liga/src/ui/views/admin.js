import { h, copyText, downloadFile } from '../dom.js';
import { sectionTitle } from '../components/widgets.js';
import { buildLink, generateToken } from '../../core/identity.js';
import { exportRoster } from '../../core/roster.js';
import { exportTeam } from '../../core/team.js';
import { money, number as fmtNumber } from '../../core/format.js';
import { normalizeMoney } from '../../data/types.js';
import { exportConfig } from '../../core/settings.js';

/**
 * ÁREA ADMINISTRATIVA — exclusiva do gestor.
 * Acessos, configuração das regras e estado da base de dados.
 */

export function adminView({ config, app, roster, rosterOrigin, team, teamOrigin, connection, diagnostico, sourceHealth }) {
  const tab = app.state.adminTab ?? 'lancar';
  return h('div', { class: 'view view-admin' },
    h('header', { class: 'app-header' },
      h('div', { class: 'app-header-main' },
        h('div', { class: 'app-title' }, h('span', { class: 'app-name', text: 'Configuração' })),
        h('div', { class: 'app-subtitle', text: 'Acessos, regras e base de dados' })),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.goDashboard(), text: '← Voltar ao painel' })),
    h('nav', { class: 'tabs' },
      tabBtn('lancar', 'Lançar', tab, app),
      tabBtn('equipe', 'Equipe', tab, app),
      tabBtn('acessos', 'Acessos', tab, app),
      tabBtn('base', 'Base de dados', tab, app),
      tabBtn('regras', 'Regras', tab, app),
      tabBtn('instalar', 'Instalar', tab, app)),
    tab === 'lancar' ? launchPanel({ app, team }) : null,
    tab === 'equipe' ? teamPanel({ app, team, teamOrigin, roster }) : null,
    tab === 'acessos' ? accessPanel({ app, roster, rosterOrigin, team }) : null,
    tab === 'base' ? dataPanel({ app, config, connection, diagnostico, sourceHealth }) : null,
    tab === 'regras' ? rulesPanel({ app, config }) : null,
    tab === 'instalar' ? installPanel({ app, roster }) : null);
}

function tabBtn(id, label, current, app) {
  return h('button', {
    class: ['tab', current === id && 'tab-on'],
    onclick: () => app.setAdminTab(id),
    text: label,
  });
}

// ------------------------------------------------------------------ lançar
/**
 * LANÇAR A PRODUÇÃO DO DIA
 *
 * Enquanto o sistema de pedidos não oferece um endereço de dados, este é o
 * caminho que faz a Liga funcionar de verdade: o gestor cola a lista da tela —
 * ou digita — e a produção real entra.
 *
 * A tabela mostra a EQUIPE INTEIRA, não só quem foi reconhecido na colagem.
 * Quem ficou zerado aparece com zero, que é exatamente o que o ranking precisa
 * saber para não deixar ninguém sumir da disputa.
 */
function launchPanel({ app, team }) {
  const vendedores = team?.vendedores ?? [];
  const lido = app.state.lancamento ?? null;
  const porId = new Map((lido?.registros ?? []).map((r) => [r.sellerId, r]));
  const campos = new Map();

  const colar = h('textarea', {
    class: 'input textarea',
    rows: '6',
    placeholder: 'Cole aqui a lista do sistema de pedidos.\n\nExemplo:\n› Erica Oliveira    R$ 370 mil    22\n› Murilo Bedani Rogerio    R$ 128.400    9',
    'aria-label': 'Produção colada',
  });

  const linhaDe = (v) => {
    const encontrado = porId.get(v.sellerId);
    const pedidos = h('input', {
      class: 'input input-mini', type: 'number', min: '0', step: '1',
      value: encontrado ? String(encontrado.orders) : '',
      placeholder: '0', 'aria-label': `Pedidos de ${v.name}`,
    });
    const faturamento = h('input', {
      class: 'input input-mini', type: 'text',
      value: encontrado ? String(encontrado.revenue) : '',
      placeholder: '0', 'aria-label': `Faturamento de ${v.name}`,
    });
    campos.set(v.sellerId, { pedidos, faturamento, name: v.name });

    return h('tr', { class: encontrado ? 'row-lido' : null },
      h('td', {}, h('span', { text: v.name }), v.uf ? h('span', { class: 'uf-tag', text: v.uf }) : null),
      h('td', { class: 'num' }, pedidos),
      h('td', { class: 'num' }, faturamento),
      h('td', {}, encontrado
        ? h('span', {
          class: ['badge', encontrado.confianca === 'alta' ? 'badge-ok' : 'badge-warn'],
          title: encontrado.confianca === 'alta'
            ? 'Faturamento identificado pelo R$ na colagem.'
            : 'Leitura por dedução — confira antes de registrar.',
          text: encontrado.confianca === 'alta' ? 'LIDO' : 'CONFIRA',
        })
        : h('span', { class: 'muted', text: '—' })));
  };

  const lerCampos = () => [...campos.entries()].map(([sellerId, campo]) => ({
    sellerId,
    sellerName: campo.name,
    orders: Number(campo.pedidos.value) || 0,
    revenue: parseMoneyInput(campo.faturamento.value),
  }));

  const registrar = () => app.registrarLancamento(lerCampos());

  const copiarParaPlanilha = async (evento) => {
    // O alvo precisa ser guardado ANTES do await: depois do primeiro tick do
    // laço de eventos, `currentTarget` já foi zerado pelo navegador.
    const botao = evento.currentTarget;
    const antes = botao.textContent;
    const ok = await copyText(app.linhasParaPlanilha(lerCampos()));
    botao.textContent = ok ? 'Copiado! Agora cole na planilha' : 'Copie manualmente';
    setTimeout(() => { botao.textContent = antes; }, 2600);
  };

  return h('section', { class: 'card' },
    sectionTitle('Lançar a produção do dia',
      h('span', { class: 'section-hint', text: `${fmtNumber(vendedores.length)} vendedores` })),

    h('div', { class: 'alert alert-info' },
      h('strong', { text: 'Enquanto o sistema de pedidos não tiver um endereço de dados, é por aqui. ' }),
      'Cole a lista da tela ou digite os números. Cada lançamento vira um ponto da curva do dia — '
      + 'é o que faz ritmo, projeção e comparação com ontem existirem. Lançar duas ou três vezes ao dia já dá uma curva boa.'),

    vendedores.length === 0
      ? h('p', { class: 'muted', text: 'Cadastre a equipe primeiro, na aba Equipe.' })
      : h('div', {},
        colar,
        h('div', { class: 'button-row' },
          h('button', {
            class: 'btn',
            onclick: () => app.lerColagem(colar.value),
            text: 'Ler o texto colado',
          }),
          h('button', {
            class: 'btn btn-ghost btn-sm',
            onclick: () => app.limparLancamento(),
            text: 'Limpar',
          })),

        lido?.naoCadastrados?.length
          ? h('div', { class: 'alert alert-warn' },
            h('strong', { text: 'Fora do cadastro da equipe: ' }),
            'estes nomes vieram na colagem mas não estão na sua equipe, então não entram no ranking. '
            + 'Se forem seus, adicione na aba Equipe e cole de novo.',
            h('ul', { class: 'steps' }, lido.naoCadastrados.map((n) => h('li', {
              text: `${n.sellerName} — ${fmtNumber(n.orders)} pedido(s), ${money(n.revenue)}`,
            }))))
          : null,
        lido?.avisos?.length
          ? h('div', { class: 'alert alert-warn' }, h('ul', { class: 'steps' }, lido.avisos.map((a) => h('li', { text: a }))))
          : null,

        h('div', { class: 'table-scroll' },
          h('table', { class: 'data-table' },
            h('thead', {}, h('tr', {},
              h('th', { text: 'Vendedor' }),
              h('th', { class: 'num', text: 'Pedidos' }),
              h('th', { class: 'num', text: 'Faturamento' }),
              h('th', { text: 'Leitura' }))),
            h('tbody', {}, vendedores.map(linhaDe)))),

        h('div', { class: 'button-row' },
          h('button', {
            class: 'btn btn-primary',
            onclick: copiarParaPlanilha,
            title: 'Copia as linhas prontas para colar na planilha do Google',
            text: '📋 Copiar para a planilha',
          }),
          h('button', { class: 'btn', onclick: registrar, text: 'Registrar só no meu painel' }),
          h('button', {
            class: 'btn btn-ghost btn-sm',
            onclick: () => app.publicarDia(),
            title: 'Gera um arquivo para enviar ao repositório — alternativa à planilha',
            text: '⬆ Baixar arquivo do dia',
          })),

        h('div', { class: 'alert alert-info' },
          h('strong', { text: 'Copiar para a planilha é o que faz a equipe ver. ' }),
          'Clique no botão azul, abra sua planilha do Google, clique na primeira célula vazia e cole (Ctrl+V). '
          + 'Pronto: o aplicativo de cada vendedor lê a planilha sozinho, sem você enviar mais nada.'),

        h('p', { class: 'privacy-note' },
          h('span', { 'aria-hidden': 'true', text: '🔒' }),
          'O que você lança fica neste navegador. Para a equipe inteira enxergar, a produção precisa vir de uma '
          + 'origem compartilhada — a função de servidor descrita em docs/INTEGRACAO-DADOS.md.'),

        app.state.ultimoLancamento
          ? h('div', { class: 'alert alert-info', text: app.state.ultimoLancamento })
          : null));
}

/** Aceita '370332', 'R$ 370.332' e '370 mil' no campo digitado. */
function parseMoneyInput(texto) {
  const limpo = String(texto ?? '').trim();
  if (!limpo) return 0;
  const numero = Number(limpo);
  if (Number.isFinite(numero)) return numero;
  return normalizeMoney(limpo) ?? 0;
}

// ------------------------------------------------------------------- equipe
function teamPanel({ app, team, teamOrigin, roster }) {
  const vendedores = team?.vendedores ?? [];
  const comAcesso = new Set((roster?.sellers ?? []).map((s) => s.sellerId));

  const nameInput = h('input', { class: 'input', type: 'text', placeholder: 'Nome do vendedor ou vendedora', 'aria-label': 'Nome' });
  const ufInput = h('input', { class: 'input input-uf', type: 'text', placeholder: 'UF', maxlength: '2', 'aria-label': 'UF' });
  const add = () => {
    if (!nameInput.value.trim()) return;
    app.addTeamMember(nameInput.value, ufInput.value);
    nameInput.value = '';
    ufInput.value = '';
  };
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const importArea = h('textarea', {
    class: 'input textarea',
    rows: '5',
    placeholder: 'Cole uma lista, um nome por linha. Aceita "Nome;UF" ou "Nome,UF".',
    'aria-label': 'Lista de vendedores',
  });

  const origemTexto = {
    publicado: 'Lendo config/vendedores.json publicado — vale para todos os computadores.',
    local: 'Cadastro alterado neste navegador. Baixe o arquivo e publique para valer na equipe inteira.',
    nenhum: 'Nenhum vendedor cadastrado. Sem este cadastro, quem estiver zerado no dia não aparece no ranking.',
  };

  return h('section', { class: 'card' },
    sectionTitle('Equipe', h('span', { class: 'section-hint', text: `${fmtNumber(vendedores.length)} vendedores` })),
    h('div', { class: ['alert', teamOrigin === 'publicado' ? 'alert-info' : 'alert-warn'], text: origemTexto[teamOrigin] }),
    h('div', { class: 'alert alert-info' },
      h('strong', { text: 'Por que este cadastro existe: ' }),
      'o sistema de pedidos lista apenas quem já vendeu no dia. É esta lista que garante que TODOS os vendedores apareçam no ranking — quem está zerado entra nas últimas posições em vez de sumir da disputa.'),

    h('div', { class: 'field-row' }, nameInput, ufInput, h('button', { class: 'btn btn-primary', onclick: add, text: '+ Adicionar' })),

    vendedores.length
      ? h('div', { class: 'table-scroll' },
        h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {},
            h('th', { text: 'Vendedor' }),
            h('th', { text: 'UF' }),
            h('th', { text: 'Acesso' }),
            h('th', { text: '' }))),
          h('tbody', {}, vendedores.map((v) => h('tr', {},
            h('td', { text: v.name }),
            h('td', { text: v.uf ?? '—' }),
            h('td', {}, comAcesso.has(v.sellerId)
              ? h('span', { class: 'badge', text: 'LINK CRIADO' })
              : h('span', { class: 'muted', text: 'sem link' })),
            h('td', { class: 'actions-cell' },
              h('button', { class: 'btn btn-sm btn-danger', onclick: () => app.removeTeamMember(v.sellerId), text: 'Remover' })))))))
      : null,

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Importar lista' }),
    importArea,
    h('div', { class: 'button-row' },
      h('button', {
        class: 'btn',
        onclick: () => { app.importTeam(importArea.value); importArea.value = ''; },
        text: 'Substituir cadastro pela lista',
      }),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => downloadFile('vendedores.json', exportTeam(team), 'application/json'),
        text: '⬇ Baixar vendedores.json',
      })),
    h('p', { class: 'muted', text: 'Substitua config/vendedores.json no repositório para o cadastro valer em todos os computadores.' }));
}

// ------------------------------------------------------------------ acessos
function accessPanel({ app, roster, rosterOrigin, team }) {
  const semAcesso = (team?.vendedores ?? []).filter(
    (v) => !(roster?.sellers ?? []).some((s) => s.sellerId === v.sellerId),
  );

  const picker = h('select', { class: 'select', 'aria-label': 'Vendedor' },
    h('option', { value: '' }, semAcesso.length ? 'Escolha um vendedor…' : 'Todos os vendedores já têm link'),
    semAcesso.map((v) => h('option', { value: v.sellerId }, v.name)));

  const add = () => {
    const sellerId = picker.value;
    if (!sellerId) return;
    const person = semAcesso.find((v) => v.sellerId === sellerId);
    app.addSeller(person.name, person.sellerId);
  };

  const originText = {
    publicado: 'Lendo config/equipe.json publicado — vale para todos os computadores.',
    local: 'Cadastro guardado apenas neste navegador. Publique o arquivo para que os links funcionem nas outras máquinas.',
    nenhum: 'Nenhum acesso cadastrado ainda.',
  };

  const issued = app.state.issuedTokens ?? {};

  return h('section', { class: 'card' },
    sectionTitle('Acessos da equipe'),
    h('div', { class: ['alert', rosterOrigin === 'local' ? 'alert-warn' : 'alert-info'], text: originText[rosterOrigin] }),

    h('div', { class: 'field-row' }, picker, h('button', { class: 'btn btn-primary', onclick: add, text: '+ Gerar acesso' })),
    (team?.vendedores ?? []).length === 0
      ? h('p', { class: 'muted', text: 'Cadastre a equipe primeiro, na aba Equipe.' })
      : null,

    (roster.sellers ?? []).length
      ? h('div', { class: 'table-scroll' },
        h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {},
            h('th', { text: 'Vendedor' }),
            h('th', { text: 'Link pessoal' }),
            h('th', { text: '' }))),
          h('tbody', {}, roster.sellers.map((s) => {
            const token = issued[s.sellerId];
            const link = token ? buildLink(app.baseUrl, 'seller', token) : null;
            return h('tr', {},
              h('td', { text: s.name }),
              h('td', { class: 'link-cell' },
                link
                  ? h('code', { class: 'link-code', text: link })
                  : h('span', { class: 'muted', text: 'link exibido apenas quando gerado — gere outro se perdeu' })),
              h('td', { class: 'actions-cell' },
                link
                  ? h('button', { class: 'btn btn-sm', onclick: (e) => copyLink(e, link), text: 'Copiar' })
                  : null,
                h('button', { class: 'btn btn-sm', onclick: () => app.regenerateSeller(s.sellerId, s.name), text: 'Novo link' }),
                h('button', { class: 'btn btn-sm btn-danger', onclick: () => app.removeSeller(s.sellerId), text: 'Remover' })));
          }))))
      : h('p', { class: 'muted', text: 'Nenhum vendedor cadastrado. Adicione o primeiro acima.' }),

    h('div', { class: 'divider' }),
    sectionTitle('Seu acesso de gestor'),
    roster.manager
      ? h('div', {},
        app.state.managerToken
          ? h('div', { class: 'alert alert-info' },
            h('strong', { text: 'Guarde este link agora: ' }),
            h('code', { class: 'link-code', text: buildLink(app.baseUrl, 'manager', app.state.managerToken) }))
          : h('p', { class: 'muted', text: 'Acesso de gestor configurado.' }),
        h('button', { class: 'btn btn-sm', onclick: () => app.regenerateManager(), text: 'Gerar novo link de gestor' }))
      : h('button', { class: 'btn btn-primary', onclick: () => app.regenerateManager(), text: 'Criar acesso de gestor' }),

    h('div', { class: 'divider' }),
    sectionTitle('Publicar o cadastro'),
    h('p', { class: 'muted', text: 'Baixe o arquivo e envie para a pasta config/ do repositório. Ele contém apenas nomes e o hash dos códigos — nenhum dado de produção, nenhum código em claro.' }),
    h('div', { class: 'button-row' },
      h('button', {
        class: 'btn btn-primary',
        onclick: () => downloadFile('equipe.json', exportRoster(roster), 'application/json'),
        text: '⬇ Baixar equipe.json',
      }),
      h('button', {
        class: 'btn',
        onclick: () => downloadFile('links-da-equipe.csv', linksCsv(app, roster), 'text/csv'),
        text: '⬇ Baixar links gerados (CSV)',
      })),
    h('p', { class: 'privacy-note' },
      h('span', { 'aria-hidden': 'true', text: '🔒' }),
      'O arquivo publicado guarda o hash do código, não o código. Quem ler o arquivo não consegue montar o link de ninguém.'));
}

function linksCsv(app, roster) {
  const issued = app.state.issuedTokens ?? {};
  const head = 'vendedor;link';
  const body = (roster.sellers ?? [])
    .filter((s) => issued[s.sellerId])
    .map((s) => `"${s.name}";${buildLink(app.baseUrl, 'seller', issued[s.sellerId])}`)
    .join('\n');
  return `${head}\n${body}`;
}

async function copyLink(event, link) {
  // Mesmo cuidado: guardar o botão antes de esperar a área de transferência.
  const btn = event.currentTarget;
  const original = btn.textContent;
  const ok = await copyText(link);
  btn.textContent = ok ? 'Copiado!' : 'Copie manualmente';
  setTimeout(() => { btn.textContent = original; }, 1600);
}

// ------------------------------------------------------------- base de dados
function dataPanel({ app, config, connection, diagnostico, sourceHealth }) {
  const c = connection ?? {};
  const isDemo = c.adapter === 'demo';
  const conectado = c.adapter === 'http-json';

  const campo = (rotulo, valor, onchange, extra = {}) => h('label', { class: 'field' },
    h('span', { class: 'field-label', text: rotulo }),
    h('input', {
      class: 'input', type: 'text', value: valor ?? '', spellcheck: 'false',
      onchange: (e) => onchange(e.target.value), ...extra,
    }),
    extra.hint ? h('small', { class: 'field-hint', text: extra.hint }) : null);

  const escolha = (rotulo, valor, opcoes, onchange, hint = null) => h('label', { class: 'field' },
    h('span', { class: 'field-label', text: rotulo }),
    h('select', { class: 'select', onchange: (e) => onchange(e.target.value) },
      opcoes.map(([v, t]) => h('option', { value: v, selected: v === valor }, t))),
    hint ? h('small', { class: 'field-hint', text: hint }) : null);

  const colar = h('textarea', {
    class: 'input textarea',
    rows: '6',
    placeholder: 'Cole aqui a resposta JSON que aparece no sistema de pedidos.',
    'aria-label': 'Resposta para analisar',
  });

  return h('section', { class: 'card' },
    sectionTitle('Base de dados'),
    h('div', { class: ['status-box', sourceHealth?.ok ? 'status-ok' : 'status-waiting'] },
      h('div', { class: 'status-head' },
        h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
        h('strong', { text: sourceHealth?.label ?? 'Aguardando definição da base' })),
      h('p', { class: 'muted', text: sourceHealth?.detail ?? '' })),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Planilha do Google — o caminho mais simples' }),
    h('p', { class: 'muted', text: 'Você cola a produção numa planilha; o aplicativo de cada vendedor lê essa mesma '
      + 'planilha sozinho. Não precisa enviar arquivo, criar senha nem mexer no repositório.' }),
    h('ol', { class: 'steps' },
      h('li', { text: 'Crie uma planilha no Google com as colunas: Nome, Data, Horário, Pedidos, Faturamento.' }),
      h('li', { text: 'Menu Arquivo → Compartilhar → Publicar na web → formato Valores separados por vírgula (.csv) → Publicar.' }),
      h('li', { text: 'Copie o link que aparece e cole abaixo.' })),
    (() => {
      const campoPlanilha = h('input', {
        class: 'input', type: 'text', value: c.planilhaUrl ?? '',
        placeholder: 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv',
        'aria-label': 'Link da planilha publicada', spellcheck: 'false',
      });
      return h('div', {},
        h('label', { class: 'field' },
          h('span', { class: 'field-label', text: 'Link da planilha publicada' }),
          campoPlanilha,
          h('small', { class: 'field-hint', text: 'Serve tanto o link publicado quanto o link normal da planilha — o aplicativo converte.' })),
        h('div', { class: 'button-row' },
          h('button', {
            class: 'btn btn-primary',
            onclick: () => app.conectarPlanilha(campoPlanilha.value),
            text: c.adapter === 'planilha' ? '↻ Reconectar planilha' : '✓ Usar esta planilha',
          }),
          c.adapter === 'planilha'
            ? h('button', { class: 'btn btn-sm', onclick: () => app.refresh(), text: 'Atualizar agora' })
            : null));
    })(),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Ligar direto no sistema de pedidos (avançado)' }),
    h('div', { class: 'alert alert-warn' },
      h('strong', { text: 'A senha fica só neste navegador. ' }),
      'O aplicativo é publicado como arquivo público: uma senha guardada na configuração '
      + 'do repositório seria publicada junto. Por isso a conexão não entra no arquivo exportado — '
      + 'e, enquanto ela viver só aqui, o painel dos vendedores continua sem dados. '
      + 'Para valer para a equipe inteira, a busca precisa passar por uma função de servidor '
      + '(instruções em docs/INTEGRACAO-DADOS.md).'),

    h('div', { class: 'field-grid' },
      campo('Endereço dos dados', c.url, (v) => app.updateConnection({ url: v }), {
        placeholder: 'https://.../api/producao?data={data}',
        hint: 'Use {data} para 2026-09-03, {dataBR} para 03/09/2026 e {hora} para 15:30.',
      }),
      escolha('Método', c.method, [['GET', 'GET'], ['POST', 'POST']],
        (v) => app.updateConnection({ method: v }))),

    h('div', { class: 'field-grid' },
      escolha('Autenticação', c.auth?.mode, [
        ['none', 'Nenhuma'],
        ['query', 'Senha na URL (?senha=...)'],
        ['header', 'Cabeçalho (Authorization)'],
        ['body', 'No corpo do POST'],
      ], (v) => app.updateConnection({ auth: { mode: v } }, { rerender: true })),
      c.auth?.mode !== 'none'
        ? campo('Nome do campo', c.auth?.field, (v) => app.updateConnection({ auth: { field: v } }), { placeholder: 'senha' })
        : null,
      c.auth?.mode !== 'none'
        ? campo('Senha', c.auth?.value, (v) => app.updateConnection({ auth: { value: v } }), { type: 'password' })
        : null),

    h('div', { class: 'field-grid' },
      campo('Caminho até a lista', c.collectionPath, (v) => app.updateConnection({ collectionPath: v }), {
        placeholder: 'deixe vazio para procurar sozinho',
        hint: 'Ex.: dados.vendedores',
      }),
      escolha('O que cada linha significa', c.semantics, [
        ['cumulative', 'Acumulado do dia até o horário'],
        ['incremental', 'Um pedido isolado'],
      ], (v) => app.updateConnection({ semantics: v })),
      escolha('Horário', c.timeMode, [
        ['fetchTime', 'A origem só diz "como está agora"'],
        ['field', 'A origem traz o horário de cada linha'],
      ], (v) => app.updateConnection({ timeMode: v }),
      'Se a origem não tem histórico, o aplicativo monta a curva do dia guardando cada leitura.')),

    h('div', { class: 'button-row' },
      h('button', { class: 'btn btn-primary', onclick: () => app.testConnection(), text: '⚡ Testar conexão' }),
      conectado
        ? h('button', { class: 'btn btn-danger', onclick: () => app.disconnectSource(), text: 'Desconectar' })
        : h('button', { class: 'btn', onclick: () => app.connectHttpSource(), text: 'Usar esta origem' })),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Ou analise uma resposta colada' }),
    h('p', { class: 'muted', text: 'No sistema de pedidos, abra as Ferramentas do Desenvolvedor (F12), aba Rede, '
      + 'clique no seu nome e copie a resposta JSON da chamada que aparecer. Cole abaixo: o aplicativo diz '
      + 'exatamente o que entendeu, sem tocar na rede.' }),
    colar,
    h('div', { class: 'button-row' },
      h('button', { class: 'btn', onclick: () => app.analyzePasted(colar.value), text: 'Analisar resposta' })),

    diagnostico ? diagnosticoBlock(diagnostico, app) : null,

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Modo de Espera de Dados' }),
    h('p', { class: 'muted', text: 'Enquanto nenhuma origem estiver conectada, o aplicativo funciona por inteiro — '
      + 'navegação, permissões, ranking, projeções e gamificação — e as telas que dependem de produção real '
      + 'mostram estado de espera em vez de números inventados.' }),
    h('div', { class: 'waiting-fields' },
      h('span', { class: 'waiting-fields-label', text: 'Campos que a base deverá fornecer' }),
      h('div', { class: 'waiting-chips' },
        ['Nome', 'Data', 'Horário', 'Número de pedidos', 'Faturamento'].map((f) => h('span', { class: 'chip', text: f })))),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Modo demonstração' }),
    h('p', { class: 'muted', text: 'Liga números fictícios para conferir telas, permissões e cálculos. '
      + 'Fica marcado com tarja permanente e nunca se confunde com produção real.' }),
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: isDemo, onchange: (e) => app.setDemoMode(e.target.checked) }),
      h('span', { text: isDemo ? 'Demonstração LIGADA' : 'Demonstração desligada' })));
}

/** Relatório passo a passo do diagnóstico. */
function diagnosticoBlock(d, app) {
  if (d.rodando) {
    return h('div', { class: 'alert alert-info', text: 'Testando a conexão…' });
  }

  return h('div', { class: 'diagnostico' },
    h('h3', { class: 'sub-title', text: 'Resultado' }),
    h('ul', { class: 'diag-list' }, (d.etapas ?? []).map((e) => h('li', { class: ['diag-item', e.ok ? 'diag-ok' : 'diag-fail'] },
      h('span', { class: 'diag-mark', 'aria-hidden': 'true', text: e.ok ? '✓' : '✕' }),
      h('div', {},
        h('strong', { text: e.nome }),
        h('div', { class: 'diag-detail', text: e.detalhe }),
        e.dados
          ? h('pre', { class: 'diag-pre', text: typeof e.dados === 'string' ? e.dados : JSON.stringify(e.dados, null, 2) })
          : null)))),

    d.colunas?.length
      ? h('div', {},
        h('h3', { class: 'sub-title', text: 'Colunas encontradas na origem' }),
        h('div', { class: 'waiting-chips' }, d.colunas.map((col) => h('span', { class: 'chip', text: col }))),
        h('p', { class: 'muted', text: 'Se o aplicativo não reconheceu alguma, informe abaixo qual coluna corresponde a cada campo.' }),
        mapaDeCampos(app, d.colunas))
      : null,

    d.amostra?.length
      ? h('div', {},
        h('h3', { class: 'sub-title', text: 'Como o aplicativo leu as primeiras linhas' }),
        h('div', { class: 'table-scroll' },
          h('table', { class: 'data-table' },
            h('thead', {}, h('tr', {},
              h('th', { text: 'Vendedor' }),
              h('th', { text: 'Data' }),
              h('th', { text: 'Horário' }),
              h('th', { class: 'num', text: 'Pedidos' }),
              h('th', { class: 'num', text: 'Faturamento' }))),
            h('tbody', {}, d.amostra.map((r) => h('tr', {},
              h('td', { text: r.sellerName }),
              h('td', { text: r.date }),
              h('td', { text: r.time }),
              h('td', { class: 'num', text: fmtNumber(r.orders) }),
              h('td', { class: 'num', text: money(r.revenue) })))))),
        h('p', { class: 'muted', text: 'Se estes números batem com o que o sistema de pedidos mostra, a leitura está correta.' }))
      : null);
}

/** Ligação manual entre coluna da origem e campo do aplicativo. */
function mapaDeCampos(app, colunas) {
  const campos = [
    ['sellerName', 'Nome do vendedor'],
    ['orders', 'Número de pedidos'],
    ['revenue', 'Faturamento'],
    ['date', 'Data'],
    ['time', 'Horário'],
  ];
  return h('div', { class: 'field-grid' }, campos.map(([chave, rotulo]) => h('label', { class: 'field' },
    h('span', { class: 'field-label', text: rotulo }),
    h('select', {
      class: 'select',
      onchange: (e) => app.updateConnection({
        fieldMap: { ...(app.connection.fieldMap ?? {}), [chave]: e.target.value ? [e.target.value] : undefined },
      }),
    },
    h('option', { value: '' }, 'reconhecer sozinho'),
    colunas.map((col) => h('option', {
      value: col,
      selected: (app.connection.fieldMap?.[chave] ?? [])[0] === col,
    }, col))))));
}

// -------------------------------------------------------------------- regras
function rulesPanel({ app, config }) {
  const num = (label, path, value, step = 1, suffix = '') => h('label', { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    h('div', { class: 'field-inline' },
      h('input', {
        class: 'input', type: 'number', value, step,
        onchange: (e) => app.updateConfigPath(path, Number(e.target.value)),
      }),
      suffix ? h('span', { class: 'field-suffix', text: suffix }) : null));

  const time = (label, path, value) => h('label', { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    h('input', {
      class: 'input', type: 'time', value,
      onchange: (e) => app.updateConfigPath(path, e.target.value),
    }));

  const toggle = (label, path, value, hint = null) => h('label', { class: 'switch switch-block' },
    h('input', {
      type: 'checkbox',
      checked: value,
      onchange: (e) => app.updateConfigPath(path, e.target.checked, { rerender: true }),
    }),
    h('span', {}, h('span', { text: label }), hint ? h('small', { class: 'switch-hint', text: hint }) : null));

  return h('section', { class: 'card' },
    sectionTitle('Regras do aplicativo'),

    h('h3', { class: 'sub-title', text: 'Horário comercial' }),
    h('div', { class: 'field-grid' },
      time('Abertura', 'businessHours.start', config.businessHours?.start ?? '08:00'),
      time('Fechamento', 'businessHours.end', config.businessHours?.end ?? '18:00')),
    h('p', { class: 'muted', text: 'Ritmo e projeção usam apenas minutos de expediente: o intervalo configurado não dilui o ritmo.' }),

    h('h3', { class: 'sub-title', text: 'Metas do dia' }),
    h('div', { class: 'field-grid' },
      num('Pedidos por vendedor', 'goals.dailyOrders', config.goals?.dailyOrders ?? 0, 1, 'pedidos'),
      num('Faturamento por vendedor', 'goals.dailyRevenue', config.goals?.dailyRevenue ?? 0, 1000, 'R$')),

    h('h3', { class: 'sub-title', text: 'Projeção' }),
    h('label', { class: 'field' },
      h('span', { class: 'field-label', text: 'Modelo' }),
      h('select', {
        class: 'select',
        onchange: (e) => app.updateConfigPath('projection.model', e.target.value),
      },
      h('option', { value: 'blend', selected: config.projection?.model === 'blend' }, 'Combinado (ritmo + curva de ontem)'),
      h('option', { value: 'linear', selected: config.projection?.model === 'linear' }, 'Linear (só o ritmo de hoje)'),
      h('option', { value: 'curve', selected: config.projection?.model === 'curve' }, 'Curva do dia anterior'))),
    h('div', { class: 'field-grid' },
      num('Minutos mínimos antes de projetar', 'projection.minElapsedMinutes', config.projection?.minElapsedMinutes ?? 30, 5, 'min'),
      num('Multiplicador máximo', 'projection.maxMultiplier', config.projection?.maxMultiplier ?? 4, 0.5, 'x')),

    h('h3', { class: 'sub-title', text: 'Privacidade' }),
    toggle('Mostrar o total da equipe ao vendedor', 'privacy.sellerSeesTeamAggregate',
      config.privacy?.sellerSeesTeamAggregate !== false, 'Somente somas — nunca resultado individual de colega.'),
    num('Mínimo de vendedores ativos para exibir o total', 'privacy.minTeamSizeForAggregate',
      config.privacy?.minTeamSizeForAggregate ?? 3, 1, 'pessoas'),
    toggle('Mostrar distância para a próxima posição', 'privacy.sellerSeesGapToNext',
      config.privacy?.sellerSeesGapToNext !== false, 'Apenas a magnitude, nunca a identidade.'),
    toggle('Mostrar vantagem sobre a posição anterior', 'privacy.sellerSeesGapToPrevious',
      config.privacy?.sellerSeesGapToPrevious !== false),
    h('div', { class: 'alert alert-info' },
      h('strong', { text: 'Não configurável: ' }),
      'ranking nominal, dados de outro vendedor, comparação entre vendedores e exportação são exclusivos do gestor por definição do produto. Não há chave que libere isso ao vendedor.'),

    h('h3', { class: 'sub-title', text: 'Atualização' }),
    num('Intervalo de atualização automática', 'ui.refreshSeconds', config.ui?.refreshSeconds ?? 60, 15, 'segundos'),

    h('div', { class: 'divider' }),
    h('div', { class: 'button-row' },
      h('button', {
        class: 'btn btn-primary',
        onclick: () => downloadFile('app.config.json', exportConfig(), 'application/json'),
        text: '⬇ Baixar configuração',
      }),
      h('button', { class: 'btn btn-danger', onclick: () => app.resetConfig(), text: 'Restaurar padrão' })),
    h('p', { class: 'muted', text: 'As alterações valem neste navegador. Baixe o arquivo e substitua config/app.config.json no repositório para valerem para toda a equipe.' }));
}

// ------------------------------------------------------------------ instalar
function installPanel({ app, roster }) {
  const base = app.baseUrl;
  return h('section', { class: 'card' },
    sectionTitle('Instalar no computador do vendedor'),
    h('p', { class: 'muted', text: 'O objetivo é um atalho na área de trabalho, abertura automática ao ligar o computador e uma janela pequena que fique de lado sem atrapalhar.' }),

    h('h3', { class: 'sub-title', text: 'Windows — atalho + inicialização automática' }),
    h('ol', { class: 'steps' },
      h('li', { text: 'Baixe a pasta deploy/windows do repositório para a máquina do vendedor.' }),
      h('li', { text: 'Dê dois cliques em Instalar-Dubosa.bat.' }),
      h('li', { text: 'Cole o link pessoal do vendedor quando for pedido.' }),
      h('li', { text: 'Pronto: atalho na área de trabalho, início junto com o Windows e janela pequena, já minimizada.' })),

    h('h3', { class: 'sub-title', text: 'Sem instalar nada (qualquer sistema)' }),
    h('ol', { class: 'steps' },
      h('li', { text: 'Abra o link pessoal no Chrome ou no Edge.' }),
      h('li', { text: 'Menu do navegador → Instalar / Instalar aplicativo.' }),
      h('li', { text: 'O aplicativo ganha janela própria e ícone, e pode ser minimizado como qualquer programa.' })),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Endereço deste aplicativo' }),
    h('code', { class: 'link-code', text: base }),
    h('p', { class: 'muted', text: `${fmtNumber((roster.sellers ?? []).length)} vendedor(es) com acesso cadastrado.` }),
    h('p', { class: 'muted', text: 'Passo a passo completo em docs/INSTALACAO.md.' }));
}
