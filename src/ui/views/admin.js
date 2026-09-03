import { h, copyText, downloadFile } from '../dom.js';
import { sectionTitle } from '../components/widgets.js';
import { buildLink, generateToken } from '../../core/identity.js';
import { exportRoster } from '../../core/roster.js';
import { exportTeam } from '../../core/team.js';
import { exportConfig } from '../../core/settings.js';
import { money, number } from '../../core/format.js';

/**
 * ÁREA ADMINISTRATIVA — exclusiva do gestor.
 * Acessos, configuração das regras e estado da base de dados.
 */

export function adminView({ config, app, roster, rosterOrigin, team, teamOrigin, sourceHealth }) {
  const tab = app.state.adminTab ?? 'equipe';
  return h('div', { class: 'view view-admin' },
    h('header', { class: 'app-header' },
      h('div', { class: 'app-header-main' },
        h('div', { class: 'app-title' }, h('span', { class: 'app-name', text: 'Configuração' })),
        h('div', { class: 'app-subtitle', text: 'Acessos, regras e base de dados' })),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => app.goDashboard(), text: '← Voltar ao painel' })),
    h('nav', { class: 'tabs' },
      tabBtn('equipe', 'Equipe', tab, app),
      tabBtn('acessos', 'Acessos', tab, app),
      tabBtn('base', 'Base de dados', tab, app),
      tabBtn('regras', 'Regras', tab, app),
      tabBtn('instalar', 'Instalar', tab, app)),
    tab === 'equipe' ? teamPanel({ app, team, teamOrigin, roster }) : null,
    tab === 'acessos' ? accessPanel({ app, roster, rosterOrigin, team }) : null,
    tab === 'base' ? dataPanel({ app, config, sourceHealth }) : null,
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
    sectionTitle('Equipe', h('span', { class: 'section-hint', text: `${number(vendedores.length)} vendedores` })),
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
  const ok = await copyText(link);
  const btn = event.currentTarget;
  const original = btn.textContent;
  btn.textContent = ok ? 'Copiado!' : 'Copie manualmente';
  setTimeout(() => { btn.textContent = original; }, 1600);
}

// ------------------------------------------------------------- base de dados
function dataPanel({ app, config, sourceHealth }) {
  const isDemo = config.dataSource?.adapter === 'demo';
  return h('section', { class: 'card' },
    sectionTitle('Base de dados'),
    h('div', { class: ['status-box', sourceHealth?.ok ? 'status-ok' : 'status-waiting'] },
      h('div', { class: 'status-head' },
        h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
        h('strong', { text: sourceHealth?.label ?? 'Aguardando definição da base' })),
      h('p', { class: 'muted', text: sourceHealth?.detail ?? '' })),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Modo de Espera de Dados' }),
    h('p', { class: 'muted', text: 'A forma de carregamento da base ainda não foi definida. O aplicativo funciona por inteiro — navegação, permissões, ranking, projeções e gamificação — e as telas que dependem de produção real mostram estado de espera em vez de números inventados.' }),
    h('div', { class: 'waiting-fields' },
      h('span', { class: 'waiting-fields-label', text: 'Campos que a base deverá fornecer' }),
      h('div', { class: 'waiting-chips' },
        ['Nome', 'Data', 'Horário', 'Número de pedidos', 'Faturamento'].map((f) => h('span', { class: 'chip', text: f })))),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Modo demonstração' }),
    h('p', { class: 'muted', text: 'Liga números fictícios para você conferir telas, permissões e cálculos antes de a base existir. Fica marcado com tarja permanente e nunca se confunde com produção real.' }),
    h('label', { class: 'switch' },
      h('input', {
        type: 'checkbox',
        checked: isDemo,
        onchange: (e) => app.setDemoMode(e.target.checked),
      }),
      h('span', { text: isDemo ? 'Demonstração LIGADA' : 'Demonstração desligada' })),

    h('div', { class: 'divider' }),
    h('h3', { class: 'sub-title', text: 'Quando a fonte for definida' }),
    h('ol', { class: 'steps' },
      h('li', { text: 'Crie o adaptador em src/data/sources/ estendendo DataSource.' }),
      h('li', { text: 'Registre-o em src/data/sources/registry.js.' }),
      h('li', { text: 'Aponte dataSource.adapter em config/app.config.json para o id dele.' }),
      h('li', { text: 'Nenhuma tela, cálculo ou regra de permissão precisa ser alterada.' })),
    h('p', { class: 'muted', text: 'Detalhes em docs/INTEGRACAO-DADOS.md.' }));
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
    h('input', { type: 'checkbox', checked: value, onchange: (e) => app.updateConfigPath(path, e.target.checked) }),
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
    h('p', { class: 'muted', text: `${number((roster.sellers ?? []).length)} vendedor(es) com acesso cadastrado.` }),
    h('p', { class: 'muted', text: 'Passo a passo completo em docs/INSTALACAO.md.' }));
}
