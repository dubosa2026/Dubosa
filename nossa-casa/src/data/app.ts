// Controlador do aplicativo: servidor, login, casa, sincronização e notificações.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { today as todayISO } from '../domain/dates';
import { shareMessage, type ConnectionInfo } from '../domain/connection';
import { randomId } from '../domain/ids';
import { seedHousehold, seedIds, seedMembers, seedTemplates } from '../domain/seed';
import type { Household, Member, TaskInstance } from '../domain/types';
import { Actions } from './actions';
import { loadBackend, saveBackend, type BackendConfig } from './config';
import { checkServer } from './serverCheck';
import { notifyPartnerChange, rescheduleNotifications, setupNotifications } from './notifications';
import { SupabaseRemote, type Row, type TableName } from './remote';
import { Store, type KV, type State } from './store';
import { getSupabase, resetSupabase } from './supabase';

export type Phase = 'loading' | 'server' | 'login' | 'onboarding' | 'ready';

const kv: KV = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};

class App {
  phase: Phase = 'loading';
  backend: BackendConfig | null = null;
  sb: SupabaseClient | null = null;
  email: string | null = null;
  store: Store = new Store({ kv, namespace: 'none' });
  actions: Actions = new Actions(this.store);
  error: string | null = null;
  /** Código de convite recebido pelo "código de conexão" (preenche a tela de entrar na casa). */
  pendingInvite: string | null = null;
  private listeners = new Set<() => void>();
  private storeUnsub: (() => void) | null = null;
  private cleanups: (() => void)[] = [];
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }
  private setPhase(p: Phase) {
    this.phase = p;
    this.emit();
  }

  // ----------------------------------------------------------------- início
  async init() {
    this.backend = await loadBackend();
    if (!this.backend) return this.setPhase('server');
    if (this.backend.mode === 'demo') {
      await this.useStore('demo', null);
      return this.setPhase(this.store.state.household ? 'ready' : 'onboarding');
    }
    this.sb = getSupabase(this.backend);
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return this.setPhase('login');
    this.email = user.email ?? null;
    await this.afterLogin(user.id);
  }

  async configureServer(cfg: BackendConfig) {
    if (cfg.mode === 'cloud') {
      const problem = await checkServer(cfg.url, cfg.anonKey);
      if (problem) throw new Error(problem);
    }
    await saveBackend(cfg);
    resetSupabase();
    this.setPhase('loading');
    await this.init();
  }

  /** Aplica um código de conexão vindo do outro celular (colado ou por link). */
  async applyConnection(info: ConnectionInfo) {
    if (info.invite) this.pendingInvite = info.invite;
    const same = this.backend?.mode === 'cloud' && this.backend.url === info.url.trim() && this.backend.anonKey === info.anonKey.trim();
    if (same) {
      this.emit();
      return;
    }
    if (this.phase === 'ready' || this.phase === 'onboarding') {
      throw new Error('Este celular já está conectado. Para trocar de servidor, use Configurações → Trocar servidor.');
    }
    await this.configureServer({ mode: 'cloud', url: info.url.trim(), anonKey: info.anonKey.trim() });
  }

  /** Mensagem pronta para mandar ao outro celular (WhatsApp etc.). */
  connectionMessage(): string | null {
    if (this.backend?.mode !== 'cloud') return null;
    return shareMessage({ url: this.backend.url, anonKey: this.backend.anonKey, invite: this.store.state.household?.invite_code ?? null });
  }

  async resetServer() {
    await this.logout();
    await saveBackend(null);
    resetSupabase();
    this.backend = null;
    this.setPhase('server');
  }

  private async useStore(namespace: string, sb: SupabaseClient | null) {
    this.teardown();
    this.store = new Store({
      kv,
      namespace,
      remote: sb ? new SupabaseRemote(sb) : null,
      onRemoteChange: (t, r, p) => this.onRemoteChange(t, r, p),
    });
    this.actions = new Actions(this.store);
    await this.store.load();
    this.storeUnsub = this.store.subscribe(() => this.scheduleNotifications());
    this.emit();
  }

  // ----------------------------------------------------------------- login
  async signIn(email: string, password: string) {
    if (!this.sb) throw new Error('Servidor não configurado.');
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(translateAuthError(error.message));
    this.email = data.user.email ?? null;
    await this.afterLogin(data.user.id);
  }

  async signUp(email: string, password: string): Promise<'ok' | 'confirm'> {
    if (!this.sb) throw new Error('Servidor não configurado.');
    const { data, error } = await this.sb.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(translateAuthError(error.message));
    if (!data.session || !data.user) return 'confirm';
    this.email = data.user.email ?? null;
    await this.afterLogin(data.user.id);
    return 'ok';
  }

  private async afterLogin(userId: string) {
    await this.useStore(`cloud:${userId}`, this.sb);
    if (this.store.state.household) {
      // Já temos a casa no celular: abre na hora (mesmo sem internet) e sincroniza em segundo plano.
      this.setPhase('ready');
      void this.startSync();
      return;
    }
    const { data, error } = await this.sb!.from('members').select('*').eq('user_id', userId).maybeSingle();
    if (error) {
      this.error = error.message;
      return this.setPhase('onboarding');
    }
    if (!data) return this.setPhase('onboarding');
    await this.loadHouseholdFromServer((data as Member).household_id, (data as Member).id);
  }

  private async loadHouseholdFromServer(householdId: string, meId: string) {
    const { data: h, error } = await this.sb!.from('households').select('*').eq('id', householdId).single();
    if (error || !h) throw new Error(error?.message ?? 'Casa não encontrada.');
    this.store.hydrate({ household: h as Household });
    this.store.setMeta({ meId });
    await this.store.pull();
    this.setPhase('ready');
    await this.startSync();
  }

  async logout() {
    this.teardown();
    if (this.sb) await this.sb.auth.signOut();
    // Por segurança, apaga os dados da família deste celular ao sair.
    await this.store.clear();
    this.email = null;
    this.setPhase(this.backend?.mode === 'demo' ? 'server' : 'login');
  }

  // ----------------------------------------------------------------- casa
  /** Primeira pessoa: cria a casa já com todos os dados iniciais. */
  async createHousehold(who: 'eduardo' | 'jussara') {
    const hid = randomId();
    const ids = seedIds(hid);
    const household = seedHousehold(ids, null, new Date().toISOString());
    // Tudo já vem configurado: dá para usar na hora (a revisão fica em Configurações).
    household.settings.onboarding_done = true;
    const members = seedMembers(ids, new Date().toISOString());
    const templates = seedTemplates(ids, new Date().toISOString());
    const me = who === 'eduardo' ? ids.eduardo : ids.jussara;
    if (this.backend?.mode === 'cloud') {
      const { data, error } = await this.sb!.rpc('create_household', { p: { household, members, templates, me } });
      if (error) throw new Error(error.message);
      household.invite_code = (data as { invite_code: string }).invite_code;
    }
    this.store.hydrate({ household, members, templates });
    this.store.setMeta({ meId: me });
    if (this.backend?.mode === 'cloud') await this.store.pull();
    this.actions.ensurePlanned(todayISO());
    this.setPhase('ready');
    await this.startSync();
    return household.invite_code;
  }

  async inviteMembers(code: string): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.sb!.rpc('invite_members', { p_code: code });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string }[];
  }

  /** Segunda pessoa: entra com o código de convite. */
  async joinHousehold(code: string, memberId: string) {
    const { data, error } = await this.sb!.rpc('join_household', { p_code: code, p_member: memberId });
    if (error) throw new Error(error.message);
    await this.loadHouseholdFromServer((data as { household_id: string }).household_id, memberId);
  }

  async renewInvite(): Promise<string | null> {
    const h = this.store.state.household;
    if (!h || !this.sb) return null;
    const { data, error } = await this.sb.rpc('renew_invite', { p_household: h.id });
    if (error) throw new Error(error.message);
    this.store.hydrate({ household: { ...h, invite_code: data as string } });
    return data as string;
  }

  /** Modo demonstração: troca de pessoa para simular os dois celulares. */
  switchDemoPerson(memberId: string) {
    this.store.setMeta({ meId: memberId });
    this.emit();
  }

  // ----------------------------------------------------------------- sincronização
  private async startSync() {
    void setupNotifications().then(() => this.scheduleNotifications());
    if (!this.store.remote) {
      this.actions.ensurePlanned(todayISO());
      return;
    }
    const net = NetInfo.addEventListener((s) => {
      this.store.setOnline(!!s.isConnected && s.isInternetReachable !== false);
    });
    const appState = AppState.addEventListener('change', (st) => {
      if (st === 'active') void this.refresh();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void this.store.syncNow();
    }, 5 * 60 * 1000);
    this.cleanups.push(() => net(), () => appState.remove(), () => clearInterval(timer));
    this.store.startRealtime();
    await this.refresh();
  }

  async refresh() {
    await this.store.syncNow();
    this.fixFamilyNames();
    this.actions.ensurePlanned(todayISO());
    await this.store.flush();
  }

  /** Casas criadas antes de sabermos o nome do caçula: "Caçula" vira "Ian". */
  private fixFamilyNames() {
    const s = this.store.state;
    if (!s.household) return;
    const child2 = s.members.find((m) => m.id === seedIds(s.household!.id).child2);
    if (child2 && child2.name === 'Caçula') this.actions.updateMember(child2.id, { name: 'Ian', emoji: '👦' });
  }

  private teardown() {
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.store.stopRealtime();
    this.storeUnsub?.();
    this.storeUnsub = null;
  }

  private scheduleNotifications() {
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => {
      const s = this.store.state;
      const me = s.members.find((m) => m.id === s.meId);
      void rescheduleNotifications(s.household, me, s);
    }, 3000);
  }

  private onRemoteChange(table: TableName, row: Row, prev: Row | undefined) {
    const s = this.store.state;
    if (!s.household?.settings.notifications.partner_changes || !s.household.settings.notifications.enabled) return;
    const actor = row.updated_by as string | undefined;
    if (!actor || actor === s.meId) return;
    const who = s.members.find((m) => m.id === actor)?.name ?? 'Alguém';
    if (table === 'task_instances') {
      const i = row as unknown as TaskInstance;
      const p = prev as unknown as TaskInstance | undefined;
      if (p && p.status !== 'done' && i.status === 'done') void notifyPartnerChange(`${who} concluiu: ${i.title} ✅`);
      else if (p && s.meId && !p.assignee_ids.includes(s.meId) && i.assignee_ids.includes(s.meId) && i.status === 'pending') {
        void notifyPartnerChange(`${who} passou para você: ${i.title}`);
      } else if (!p && !i.template_id && i.kind !== 'coverage') void notifyPartnerChange(`${who} criou: ${i.title}`);
    } else if (table === 'shopping_items' && !prev) {
      void notifyPartnerChange(`${who} adicionou à lista de compras: ${row.name as string}`);
    }
  }
}

function translateAuthError(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return 'Usuário ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme o e-mail (veja sua caixa de entrada) ou desative a confirmação no Supabase.';
  if (/already registered|already been registered|already exists/i.test(msg)) return 'Esse usuário já existe. Toque em "Já tenho usuário" para entrar.';
  if (/Password should be/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Signups not allowed|signups are disabled|Signups? (are )?disabled/i.test(msg)) {
    return 'O servidor está recusando cadastros. No Supabase: Authentication → Sign In / Providers → Email: deixe "Enable Email provider" LIGADO e só "Confirm email" DESLIGADO; e "Allow new users to sign up" LIGADO.';
  }
  return msg;
}

export const app = new App();

/** Estado da casa (re-renderiza quando muda). */
export function useNC<T>(selector: (s: State) => T): T {
  useSyncExternalStore(app.subscribe, app.getVersion, app.getVersion);
  const store = app.store;
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return selector(state);
}

export function usePhase(): Phase {
  useSyncExternalStore(app.subscribe, app.getVersion, app.getVersion);
  return app.phase;
}
