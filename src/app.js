import { mount, h, downloadFile } from './ui/dom.js';
import { loadConfig, getConfig, updateConfig, resetConfig } from './core/settings.js';
import {
  loadRoster, saveLocalRoster, createSellerAccess, setManagerAccess, removeSellerAccess, emptyRoster,
} from './core/roster.js';
import {
  resolveIdentity, resolveFirstIdentity, parseRoute, buildLink,
} from './core/identity.js';
import {
  loadTeam, saveLocalTeam, indexTeam, resolveSeller, addToTeam, removeFromTeam,
  teamFromLines, emptyTeam,
} from './core/team.js';
import { createSource } from './data/sources/registry.js';
import { parsePastedProduction } from './data/parsePasted.js';
import { registrarProducao } from './data/sources/ManualSource.js';
import { exportarDia } from './data/sources/PublishedFileSource.js';
import {
  loadConnection, saveConnection, toSourceOptions, emptyConnection,
} from './core/connection.js';
import { buildDayState, emptyDayState, mergeTeam } from './data/store.js';
import { slugifyName as slug } from './data/types.js';
import { buildSellerView, buildManagerView, markHighPerformance } from './core/access.js';
import {
  nowInTimezone, previousBusinessDay, previousBusinessDays, totalBusinessMinutes,
} from './core/clock.js';
import { sellerView } from './ui/views/seller.js';
import { managerView } from './ui/views/manager.js';
import { loginView } from './ui/views/login.js';
import { adminView } from './ui/views/admin.js';
import { demoBanner } from './ui/components/waiting.js';

/**
 * ORQUESTRADOR
 * ============
 *
 * Junta identidade, configuração, fonte de dados e telas. Nenhuma regra de
 * negócio mora aqui: quem calcula é `core/`, quem decide o que cada perfil vê
 * é `core/access.js`.
 */

const HISTORY_DAYS = 5;

class App {
  constructor(root) {
    this.root = root;
    this.config = {};
    this.roster = emptyRoster();
    this.rosterOrigin = 'nenhum';
    this.connection = emptyConnection();
    this.competitive = null;
    this.teamFromSource = null;
    this.team = emptyTeam();
    this.teamOrigin = 'nenhum';
    this.teamIndex = { byId: new Map(), byShort: new Map(), size: 0 };
    this.identity = null;
    this.source = null;
    this.sourceHealth = null;
    this.data = { today: null, yesterday: null, historyDays: [] };
    // No perfil de vendedor guardamos SÓ o painel pronto. Ver `sealSellerData`.
    this.sellerVM = null;
    this.error = null;
    this.timer = null;

    this.state = {
      screen: 'dashboard',
      compact: false,
      metric: 'revenue',
      chartAsTable: false,
      managerTab: 'ranking',
      adminTab: 'lancar',
      selectedSeller: null,
      previewSellerId: null,
      compareA: null,
      compareB: null,
      // No build de demonstração os links de teste já vêm prontos, para que a
      // aba Acessos possa mostrá-los sem o gestor precisar gerar um a um.
      issuedTokens: { ...(globalThis.__LIGA_DADOS__?.tokensDeTeste ?? {}) },
      managerToken: globalThis.__LIGA_DADOS__?.tokenGestor ?? null,
    };
  }

  get baseUrl() {
    const { origin, pathname } = globalThis.location;
    return `${origin}${pathname}`.replace(/index\.html$/, '');
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    try {
      this.config = await loadConfig();
    } catch (err) {
      this.fatal(`Não foi possível carregar a configuração. ${err.message}`);
      return;
    }

    this.connection = loadConnection();
    this.state.compact = this.readPref('compact', this.config.ui?.compactByDefault ?? false);
    this.state.metric = this.readPref('metric', 'revenue');
    this.applyTheme();

    const [loaded, loadedTeam] = await Promise.all([loadRoster(), loadTeam()]);
    this.roster = loaded.roster;
    this.rosterOrigin = loaded.origin;
    this.setTeam(loadedTeam.team, loadedTeam.origin);

    globalThis.addEventListener('hashchange', () => this.handleRoute());
    await this.handleRoute();
  }

  async handleRoute() {
    const route = parseRoute();
    const stored = this.readPref('token', null);
    // Build de demonstração: abre já no painel, em vez de numa tela de entrada
    // vazia que não mostra nada do que o aplicativo faz.
    const inicial = parseRoute(globalThis.__LIGA_DADOS__?.rotaInicial ?? '').token;

    const candidatos = [route.token, stored, inicial].filter(Boolean);
    if (!candidatos.length) {
      this.identity = null;
      this.render();
      return;
    }

    // Um código guardado que deixou de existir não pode trancar a porta de quem
    // acabou de abrir um link válido. Ver core/identity.js.
    const escolhido = await resolveFirstIdentity(candidatos, this.roster);
    const identidade = escolhido?.identity ?? null;
    const token = escolhido?.token ?? null;

    if (!identidade) {
      this.error = 'Código de acesso não reconhecido. Peça o link ao gestor.';
      this.writePref('token', null);
      this.identity = null;
      this.render();
      return;
    }

    this.identity = identidade;
    this.error = null;
    this.writePref('token', token);
    await this.loadData();
    this.startAutoRefresh();
  }

  // ------------------------------------------------------------------ dados
  buildScope() {
    const role = this.identity?.role ?? 'seller';
    if (role === 'manager') return { role: 'manager', sellerId: null, include: 'team' };
    const scopedRanking = Boolean(this.source?.capabilities?.scopedRanking);
    // Sem ranking calculado na origem, a posição só pode ser obtida com o dia
    // inteiro em mãos — e aí a barreira que vale é `core/access.js`.
    return { role: 'seller', sellerId: this.identity.sellerId, include: scopedRanking ? 'own' : 'team' };
  }

  async loadData() {
    // Build que declara a própria origem (arquivo único de demonstração) manda
    // sobre a conexão guardada e sobre as preferências do navegador: ele existe
    // justamente para abrir funcionando, e uma escolha feita numa versão
    // anterior não pode deixá-lo vazio para sempre.
    const embutido = globalThis.__LIGA_DADOS__;
    const adapter = embutido?.forcarOrigem
      ? (embutido.config?.dataSource?.adapter ?? 'pending')
      : this.connection?.adapter && this.connection.adapter !== 'pending'
        ? this.connection.adapter
        : (this.config.dataSource?.adapter ?? 'pending');

    this.source = createSource(adapter, {
      ...(this.config.dataSource?.options ?? {}),
      ...toSourceOptions(this.connection),
      token: this.readPref('token', null),
      endpoint: this.connection?.endpoint ?? '/api/producao',
      businessHours: this.config.businessHours,
      timezone: this.config.app?.timezone,
      team: this.team?.vendedores ?? [],
    });
    this.sourceHealth = await this.source.health();

    const now = nowInTimezone(this.config.app?.timezone);
    this.now = now;
    const scope = this.buildScope();
    const previous = previousBusinessDay(now.date, this.config.businessHours);
    const historyDates = previousBusinessDays(now.date, this.config.businessHours, HISTORY_DAYS);

    try {
      const [todayPayload, previousPayload, historyPayloads] = await Promise.all([
        this.source.fetchDay(now.date, scope),
        previous ? this.source.fetchDay(previous, scope) : Promise.resolve(null),
        this.source.fetchDays(historyDates, scope),
      ]);

      const withTeam = (payload) => mergeTeam(buildDayState(payload), this.teamIndex, resolveSeller);

      // Quando a origem calcula o ranking, ela devolve a posição e o agregado
      // já prontos: o navegador do vendedor nunca viu os dados dos colegas.
      this.competitive = todayPayload?.meta?.competitive ?? null;
      const teamSrc = todayPayload?.meta?.team ?? null;
      this.teamFromSource = teamSrc
        ? {
          ...teamSrc,
          avgOrders: teamSrc.sellerCount ? teamSrc.orders / teamSrc.sellerCount : 0,
          avgRevenue: teamSrc.sellerCount ? teamSrc.revenue / teamSrc.sellerCount : 0,
        }
        : null;

      this.data.today = withTeam(todayPayload);
      this.data.yesterday = previousPayload ? withTeam(previousPayload) : null;
      this.data.historyDays = historyDates
        .map((d) => historyPayloads?.[d])
        .filter(Boolean)
        .map((payload) => markHighPerformance(withTeam(payload), this.config));
    } catch (err) {
      this.data.today = emptyDayState(now.date, { status: 'error', message: err.message });
      this.data.yesterday = null;
      this.data.historyDays = [];
      this.competitive = null;
      this.teamFromSource = null;
    }

    this.sealSellerData();
    this.render();
  }

  /**
   * SELAGEM DA MEMÓRIA DO VENDEDOR
   * ------------------------------
   * Quando a fonte não sabe calcular o ranking (`capabilities.scopedRanking`
   * falso), o dia inteiro precisa chegar ao navegador para que a posição exista.
   * Nada disso vai para a tela — mas ficaria parado na memória da aba, ao
   * alcance de quem abrisse o console.
   *
   * Então, assim que o painel é montado, os dados brutos da equipe são
   * descartados e só o view model — que já passou pelas três barreiras —
   * permanece. A cada atualização o ciclo se repete.
   *
   * Isto reduz a exposição; não a elimina: a resposta da rede ainda trafegou
   * completa. A eliminação de fato depende de a FONTE filtrar na origem.
   */
  sealSellerData() {
    if (this.identity?.role !== 'seller') return;
    try {
      this.sellerVM = buildSellerView({
        today: this.data.today ?? emptyDayState(this.now?.date ?? null),
        yesterday: this.data.yesterday,
        sellerId: this.identity.sellerId,
        sellerName: this.identity.sellerName,
        atMinutes: this.now?.minutes ?? 0,
        config: getConfig(),
        historyDays: this.data.historyDays,
        competitive: this.competitive,
        teamFromSource: this.teamFromSource,
      });
    } finally {
      this.data = { today: null, yesterday: null, historyDays: [] };
    }
  }

  setTeam(team, origin = this.teamOrigin) {
    this.team = team;
    this.teamOrigin = origin;
    this.teamIndex = indexTeam(team);
  }

  async refresh() {
    await this.loadData();
  }

  startAutoRefresh() {
    clearInterval(this.timer);
    const seconds = Math.max(15, this.config.ui?.refreshSeconds ?? 60);
    this.timer = setInterval(() => this.refresh(), seconds * 1000);
  }

  // ------------------------------------------------------------------ ações
  async login(token) {
    const identity = await resolveIdentity(token, this.roster);
    if (!identity) {
      this.error = 'Código de acesso não reconhecido.';
      this.render();
      return;
    }
    globalThis.location.hash = `#/${identity.role === 'manager' ? 'gestor' : 'v'}/${String(token).trim().toUpperCase()}`;
  }

  logout() {
    this.writePref('token', null);
    this.identity = null;
    clearInterval(this.timer);
    globalThis.location.hash = '#/entrar';
    this.render();
  }

  toggleCompact() {
    this.state.compact = !this.state.compact;
    this.writePref('compact', this.state.compact);
    this.render();
  }

  setMetric(metric) {
    this.state.metric = metric;
    this.writePref('metric', metric);
    this.render();
  }

  toggleChartTable() {
    this.state.chartAsTable = !this.state.chartAsTable;
    this.render();
  }

  setManagerTab(tab) { this.state.managerTab = tab; this.render(); }

  setAdminTab(tab) { this.state.adminTab = tab; this.render(); }

  /**
   * O último dia com produção, quando existe.
   *
   * Às sete da manhã — e em qualquer hora antes do primeiro pedido — o painel
   * de hoje está legitimamente vazio, e ficava só nisso: uma tela de espera
   * sem nada para olhar, com o fechamento de ontem já carregado na memória do
   * aplicativo e sem forma de ver.
   */
  get fechamentoAnterior() {
    const d = this.data.yesterday;
    return d?.sellers?.length ? d : null;
  }

  verFechamentoAnterior() { this.state.revendoDiaAnterior = true; this.render(); }

  voltarParaHoje() { this.state.revendoDiaAnterior = false; this.render(); }

  /**
   * Gestor vendo o painel de um vendedor exatamente como ele vê.
   *
   * Não afrouxa nada: o gestor já enxerga todos os números: o que muda é a
   * moldura. Serve para explicar a alguém o que ele vê, e para conferir que o
   * painel individual não expõe colega nenhum.
   */
  previewSeller(sellerId) {
    this.state.previewSellerId = sellerId;
    this.render();
  }

  sairDoPreview() {
    this.state.previewSellerId = null;
    this.render();
  }

  openSeller(sellerId) {
    this.state.selectedSeller = sellerId;
    this.state.managerTab = 'vendedor';
    this.render();
  }

  setCompare(key, value) { this.state[key] = value; this.render(); }

  goAdmin() { this.state.screen = 'admin'; this.render(); }

  goDashboard() { this.state.screen = 'dashboard'; this.render(); }

  async startFirstRun() {
    const { roster, token } = await setManagerAccess(emptyRoster(), { name: 'Gestor' });
    this.roster = roster;
    this.rosterOrigin = 'local';
    saveLocalRoster(roster);
    this.state.managerToken = token;
    this.identity = { role: 'manager', sellerId: null, sellerName: 'Gestor' };
    this.state.screen = 'admin';
    this.writePref('token', token);
    globalThis.location.hash = `#/gestor/${token}`;
    await this.loadData();
  }

  async addSeller(name, knownId = null) {
    const sellerId = knownId ?? slug(name);
    const { roster, token } = await createSellerAccess(this.roster, { sellerId, name });
    this.roster = roster;
    saveLocalRoster(roster);
    this.state.issuedTokens = { ...this.state.issuedTokens, [sellerId]: token };
    this.render();
  }

  async regenerateSeller(sellerId, name) {
    const { roster, token } = await createSellerAccess(this.roster, { sellerId, name });
    this.roster = roster;
    saveLocalRoster(roster);
    this.state.issuedTokens = { ...this.state.issuedTokens, [sellerId]: token };
    this.render();
  }

  removeSeller(sellerId) {
    this.roster = removeSellerAccess(this.roster, sellerId);
    saveLocalRoster(this.roster);
    const issued = { ...this.state.issuedTokens };
    delete issued[sellerId];
    this.state.issuedTokens = issued;
    this.render();
  }

  addTeamMember(name, uf = null) {
    if (!String(name ?? '').trim()) return;
    this.setTeam(addToTeam(this.team, name, uf));
    saveLocalTeam(this.team);
    this.render();
  }

  removeTeamMember(sellerId) {
    this.setTeam(removeFromTeam(this.team, sellerId));
    saveLocalTeam(this.team);
    this.render();
  }

  importTeam(text) {
    const parsed = teamFromLines(text);
    if (!parsed.vendedores.length) return;
    this.setTeam(parsed, 'local');
    saveLocalTeam(this.team);
    this.loadData();
  }

  async regenerateManager() {
    const { roster, token } = await setManagerAccess(this.roster, { name: this.roster.manager?.name ?? 'Gestor' });
    this.roster = roster;
    saveLocalRoster(roster);
    this.state.managerToken = token;
    this.writePref('token', token);
    this.render();
  }

  updateConfigPath(path, value, { rerender = false } = {}) {
    const patch = {};
    let cursor = patch;
    const parts = path.split('.');
    parts.forEach((part, i) => {
      if (i === parts.length - 1) cursor[part] = value;
      else { cursor[part] = {}; cursor = cursor[part]; }
    });
    this.config = updateConfig(patch);
    this.startAutoRefresh();
    if (rerender) this.render();
  }

  resetConfig() {
    this.config = resetConfig();
    this.render();
  }

  async setDemoMode(enabled) {
    this.connection = { ...this.connection, adapter: enabled ? 'demo' : 'pending' };
    saveConnection(this.connection);
    this.config = updateConfig({ dataSource: { adapter: enabled ? 'demo' : 'pending' } });
    await this.loadData();
  }

  /**
   * Altera um campo da conexão. Nunca sai do navegador do gestor.
   *
   * `rerender` é falso por padrão de propósito: redesenhar o painel a cada
   * tecla trocaria os campos por elementos novos, apagando o que o gestor
   * estava digitando e jogando o cursor fora. Só quem muda o layout do
   * formulário — o modo de autenticação, por exemplo — pede o redesenho.
   */
  updateConnection(patch, { rerender = false } = {}) {
    const auth = patch.auth ? { ...this.connection.auth, ...patch.auth } : this.connection.auth;
    this.connection = { ...this.connection, ...patch, auth };
    saveConnection(this.connection);
    if (rerender) this.render();
  }

  // ------------------------------------------------- lançamento manual
  /** Lê o texto colado do sistema de pedidos e monta a tabela de conferência. */
  lerColagem(texto) {
    const resultado = parsePastedProduction(texto, this.teamIndex);
    this.state.lancamento = resultado;
    this.state.ultimoLancamento = resultado.registros.length
      ? null
      : 'Não reconheci nenhum vendedor no texto colado. Confira se os nomes batem com o cadastro da equipe.';
    this.render();
  }

  /**
   * Monta as linhas para colar na planilha do Google.
   *
   * Separadas por tabulação: colar numa célula do Google Sheets distribui cada
   * valor na sua coluna, sem nenhuma conversão. Vai a equipe INTEIRA, com zero
   * para quem não produziu — é assim que o ranking não perde ninguém.
   */
  linhasParaPlanilha(linhas) {
    const now = nowInTimezone(this.config.app?.timezone);
    const [ano, mes, dia] = now.date.split('-');
    return (linhas ?? [])
      .map((l) => [l.sellerName, `${dia}/${mes}/${ano}`, now.time, l.orders || 0, l.revenue || 0].join('\t'))
      .join('\n');
  }

  /**
   * Gera o arquivo do dia para o gestor publicar no repositório.
   *
   * É este passo que faz a equipe inteira ver o mesmo placar: sem ele, o que
   * foi lançado existe apenas no navegador de quem lançou.
   */
  publicarDia() {
    const date = this.data.today?.date ?? nowInTimezone(this.config.app?.timezone).date;
    const conteudo = exportarDia(date, this.data.today);
    downloadFile(`${date}.json`, conteudo, 'application/json');
    this.state.ultimoLancamento = `Arquivo ${date}.json baixado. Envie para a pasta `
      + 'config/producao/ do repositório e a equipe inteira passa a ver este placar.';
    this.render();
  }

  limparLancamento() {
    this.state.lancamento = null;
    this.state.ultimoLancamento = null;
    this.render();
  }

  /**
   * Grava o lançamento e passa a servir a produção real.
   *
   * Trocar a origem para `manual` aqui é deliberado: o gestor acabou de dizer
   * quanto a equipe produziu, e faria pouco sentido a tela seguir em Modo de
   * Espera depois disso.
   */
  async registrarLancamento(linhas) {
    const now = nowInTimezone(this.config.app?.timezone);
    const { registros, hora } = registrarProducao(now.date, linhas, {
      timezone: this.config.app?.timezone,
    });

    if (!registros) {
      this.state.ultimoLancamento = 'Nada foi registrado: todas as linhas estavam zeradas.';
      this.render();
      return;
    }

    this.connection = { ...this.connection, adapter: 'manual' };
    saveConnection(this.connection);
    this.config = updateConfig({ dataSource: { adapter: 'manual' } });
    this.state.lancamento = null;
    this.state.ultimoLancamento = `Produção das ${hora} registrada para ${registros} vendedor(es). `
      + 'O painel já está usando estes números.';
    await this.loadData();
  }

  /** Liga a planilha do Google como origem da produção. */
  async conectarPlanilha(url) {
    const limpo = String(url ?? '').trim();
    if (!limpo) return;
    this.connection = { ...this.connection, planilhaUrl: limpo, adapter: 'planilha' };
    saveConnection(this.connection);
    this.config = updateConfig({ dataSource: { adapter: 'planilha' } });
    this.state.ultimoLancamento = null;
    await this.loadData();
  }

  async connectHttpSource() {
    this.connection = { ...this.connection, adapter: 'http-json' };
    saveConnection(this.connection);
    this.config = updateConfig({ dataSource: { adapter: 'http-json' } });
    await this.loadData();
  }

  async disconnectSource() {
    this.connection = { ...this.connection, adapter: 'pending' };
    saveConnection(this.connection);
    this.config = updateConfig({ dataSource: { adapter: 'pending' } });
    await this.loadData();
  }

  /** Roda o diagnóstico da conexão no navegador do gestor. */
  async testConnection() {
    const source = createSource('http-json', {
      ...toSourceOptions(this.connection),
      token: this.readPref('token', null),
      endpoint: this.connection?.endpoint ?? '/api/producao',
      timezone: this.config.app?.timezone,
    });
    this.state.diagnostico = { rodando: true };
    this.render();
    const now = nowInTimezone(this.config.app?.timezone);
    try {
      this.state.diagnostico = await source.diagnose(now.date);
    } catch (err) {
      this.state.diagnostico = { ok: false, etapas: [{ nome: 'Diagnóstico', ok: false, detalhe: err.message }] };
    }
    this.render();
  }

  /** Analisa uma resposta colada, sem tocar na rede. */
  analyzePasted(texto) {
    const source = createSource('http-json', {
      ...toSourceOptions(this.connection),
      token: this.readPref('token', null),
      endpoint: this.connection?.endpoint ?? '/api/producao',
      timezone: this.config.app?.timezone,
    });
    const now = nowInTimezone(this.config.app?.timezone);
    try {
      const json = JSON.parse(texto);
      this.state.diagnostico = source.diagnoseJson(json, now.date, [
        { nome: 'Origem', ok: true, detalhe: 'Resposta colada — nenhuma chamada de rede.' },
      ]);
    } catch (err) {
      this.state.diagnostico = {
        ok: false,
        etapas: [{ nome: 'Formato', ok: false, detalhe: `O texto colado não é JSON válido. ${err.message}` }],
      };
    }
    this.render();
  }

  // --------------------------------------------------------------- render
  render() {
    if (!this.identity) {
      mount(this.root, loginView({ app: this, error: this.error, roster: this.roster }));
      return;
    }

    const isDemo = this.data.today?.isDemo || this.sellerVM?.isDemo;
    // No arquivo único de demonstração não há o que desligar: a origem é o
    // próprio build. Oferecer o botão só criaria um clique sem efeito.
    const banner = isDemo
      ? demoBanner(globalThis.__LIGA_DADOS__?.forcarOrigem ? null : () => this.setDemoMode(false))
      : null;

    if (this.identity.role === 'manager' && this.state.screen === 'admin') {
      mount(this.root, banner, adminView({
        config: getConfig(),
        app: this,
        roster: this.roster,
        rosterOrigin: this.rosterOrigin,
        team: this.team,
        teamOrigin: this.teamOrigin,
        connection: this.connection,
        diagnostico: this.state.diagnostico,
        sourceHealth: this.sourceHealth,
      }));
      return;
    }

    const config = getConfig();
    const today = this.data.today ?? emptyDayState(this.now?.date ?? null);
    const atMinutes = this.now?.minutes ?? 0;

    try {
      if (this.identity.role === 'manager' && this.state.previewSellerId) {
        const alvo = this.state.previewSellerId;
        const vm = buildSellerView({
          today,
          yesterday: this.data.yesterday,
          sellerId: alvo,
          sellerName: today.sellers.find((s) => s.sellerId === alvo)?.sellerName ?? alvo,
          atMinutes,
          config,
          historyDays: this.data.historyDays,
        });
        mount(this.root, banner,
          h('div', { class: 'preview-bar' },
            h('span', {}, h('strong', { text: 'Visão do vendedor. ' }),
              `Este é o painel de ${vm.identity.sellerName} exatamente como ele vê — sem nome, posição ou número de nenhum colega.`),
            h('button', {
              class: 'btn btn-sm',
              onclick: () => this.sairDoPreview(),
              text: '← Voltar ao painel do gestor',
            })),
          sellerView({ vm, config, app: this }));
        return;
      }

      if (this.identity.role === 'manager') {
        // Um dia fechado se olha inteiro: avaliá-lo no minuto atual mostraria
        // o placar de ontem às 01h19, que é vazio.
        const revendo = this.state.revendoDiaAnterior && this.fechamentoAnterior;
        const vm = buildManagerView({
          today: revendo ? this.fechamentoAnterior : today,
          yesterday: revendo ? null : this.data.yesterday,
          atMinutes: revendo ? totalBusinessMinutes(config.businessHours) : atMinutes,
          config,
          historyDays: revendo ? [] : this.data.historyDays,
        });
        mount(this.root, banner, managerView({ vm, config, app: this, revendo: Boolean(revendo) }));
      } else {
        const vm = this.sellerVM ?? buildSellerView({
          today,
          yesterday: null,
          sellerId: this.identity.sellerId,
          sellerName: this.identity.sellerName,
          atMinutes,
          config,
          historyDays: [],
        });
        mount(this.root, banner, sellerView({ vm, config, app: this }));
        document.body.classList.toggle('is-compact', this.state.compact);
      }
    } catch (err) {
      // Uma falha na barreira de privacidade NUNCA vira uma tela degradada com
      // dados expostos: a tela não é renderizada.
      this.fatal(err.message);
    }
  }

  fatal(message) {
    mount(this.root, h('div', { class: 'view view-fatal' },
      h('div', { class: 'fatal-card' },
        h('div', { class: 'fatal-icon', 'aria-hidden': 'true', text: '⛔' }),
        h('h1', { text: 'Painel bloqueado' }),
        h('p', { text: message }),
        h('button', { class: 'btn', onclick: () => globalThis.location.reload(), text: 'Recarregar' }))));
  }

  applyTheme() {
    const theme = this.config.ui?.theme ?? 'dark';
    document.documentElement.dataset.theme = theme;
  }

  // ---------------------------------------------------------- preferências
  readPref(key, fallback) {
    try {
      const raw = globalThis.localStorage?.getItem(`dubosa.liga.${key}`);
      return raw === null || raw === undefined ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }

  writePref(key, value) {
    try {
      if (value === null) globalThis.localStorage?.removeItem(`dubosa.liga.${key}`);
      else globalThis.localStorage?.setItem(`dubosa.liga.${key}`, JSON.stringify(value));
    } catch { /* navegador sem armazenamento — o aplicativo segue funcionando */ }
  }
}
export function startApp(root) {
  const app = new App(root);
  app.boot();
  return app;
}
