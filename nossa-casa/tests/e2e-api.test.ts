// Ponta a ponta com a API de verdade do Supabase (PostgREST) + banco real:
// dois "celulares" com o cliente supabase-js, a mesma Store do app e a migração.
// Cobre: criar a casa, convite, entrar, sincronizar, offline, regras e segurança.
//
// Rode com NC_REST_URL apontando para um PostgREST servindo o banco da migração
// e NC_JWT_SECRET igual ao jwt-secret dele (o CI faz isso sozinho).
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Actions } from '../src/data/actions';
import { SupabaseRemote } from '../src/data/remote';
import { checkServer } from '../src/data/serverCheck';
import { Store } from '../src/data/store';
import { randomId } from '../src/domain/ids';
import { seedHousehold, seedIds, seedMembers, seedTemplates } from '../src/domain/seed';
import type { Household, Member } from '../src/domain/types';
import { MemoryKV } from './fakeRemote';

const REST = process.env.NC_REST_URL;
const SECRET = process.env.NC_JWT_SECRET ?? '';
const d = REST ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub: string) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

// O supabase-js chama /rest/v1/...; este mini-proxy repassa para o PostgREST.
let proxy: http.Server;
let base = '';

function client(user: string) {
  return createClient(base, 'anon-key-de-teste', {
    accessToken: async () => jwt(user),
    realtime: { params: {} },
  });
}

async function phone(user: string) {
  const sb = client(user);
  const store = new Store({ kv: new MemoryKV(), namespace: user, remote: new SupabaseRemote(sb) });
  await store.load();
  return { sb, store, actions: new Actions(store) };
}

const TODAY = '2026-09-21';
const EDU = randomId();
const JUS = randomId();
const STRANGER = randomId();

d('app + API Supabase (PostgREST) + banco, ponta a ponta', () => {
  beforeAll(async () => {
    const target = new URL(REST!);
    proxy = http.createServer((req, res) => {
      const path = (req.url ?? '').replace(/^\/rest\/v1/, '');
      const up = http.request({ host: target.hostname, port: target.port, path, method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      up.on('error', () => res.writeHead(502).end());
      req.pipe(up);
    });
    await new Promise<void>((r) => proxy.listen(0, r));
    base = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((r) => proxy.close(() => r())));

  const hid = randomId();
  const ids = seedIds(hid);

  it('a checagem do servidor aceita o banco preparado e recusa endereço/chave errados', async () => {
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ role: 'anon', exp: Math.floor(Date.now() / 1000) + 3600 });
    const anon = `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
    expect(await checkServer(base, anon)).toBeNull();
    expect(await checkServer(base, 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.assinatura-errada')).toMatch(/chave/);
    expect(await checkServer('http://127.0.0.1:1', anon)).toMatch(/Não consegui acessar/);
  });

  let edu: Awaited<ReturnType<typeof phone>>;
  let jus: Awaited<ReturnType<typeof phone>>;

  it('Eduardo cria a casa (mesmo caminho do app) e gera a semana', async () => {
    edu = await phone(EDU);
    const household = seedHousehold(ids, null, new Date().toISOString());
    const { data, error } = await edu.sb.rpc('create_household', {
      p: { household, members: seedMembers(ids), templates: seedTemplates(ids), me: ids.eduardo },
    });
    expect(error).toBeNull();
    expect((data as { invite_code: string }).invite_code).toMatch(/^[A-Z2-9]{8}$/);
    edu.store.hydrate({ household: { ...household, invite_code: (data as { invite_code: string }).invite_code } });
    edu.store.setMeta({ meId: ids.eduardo });
    expect(await edu.store.pull()).toBe(true);
    expect(edu.store.state.templates.length).toBe(seedTemplates(ids).length);
    edu.actions.ensurePlanned(TODAY);
    await edu.store.flush();
    expect(edu.store.pendingOps()).toBe(0);
    expect(edu.store.state.sync.error).toBeNull();
  });

  it('Jussara entra com o código e vê tudo', async () => {
    jus = await phone(JUS);
    const code = edu.store.state.household!.invite_code!;
    const { data: opts } = await jus.sb.rpc('invite_members', { p_code: code });
    expect((opts as { name: string }[]).map((o) => o.name)).toEqual(['Jussara']);
    const { error } = await jus.sb.rpc('join_household', { p_code: code, p_member: ids.jussara });
    expect(error).toBeNull();
    const { data: h } = await jus.sb.from('households').select('*').eq('id', hid).single();
    expect((h as Household).invite_code).toBeNull();
    jus.store.hydrate({ household: h as Household });
    jus.store.setMeta({ meId: ids.jussara });
    await jus.store.pull();
    expect(jus.store.state.instances.length).toBe(edu.store.state.instances.length);
    expect(jus.store.state.members.find((m: Member) => m.id === ids.jussara)?.user_id).toBe(JUS);
  });

  it('o que um conclui/cria aparece para o outro, com autoria do servidor', async () => {
    const box = edu.store.state.instances.find((i) => i.title === 'Limpar box')!;
    edu.actions.complete(box.id);
    edu.actions.addShopping('Leite', '2 caixas');
    await edu.store.flush();
    await jus.store.pull();
    const seen = jus.store.state.instances.find((i) => i.id === box.id)!;
    expect(seen.status).toBe('done');
    expect(seen.updated_by).toBe(ids.eduardo);
    const leite = jus.store.state.shopping.find((s) => s.name === 'Leite')!;
    expect(leite.added_by).toBe(ids.eduardo);
    jus.actions.toggleShopping(leite.id);
    jus.actions.addOneOff({ title: 'Comprar frutas', category: 'mercado', date: TODAY, minutes: 15, effort: 1, priority: 'medium', assignee_ids: [ids.eduardo] });
    await jus.store.flush();
    await edu.store.pull();
    expect(edu.store.state.shopping.find((s) => s.id === leite.id)!.bought).toBe(true);
    const frutas = edu.store.state.instances.find((i) => i.title === 'Comprar frutas')!;
    expect(frutas.created_by).toBe(ids.jussara);
    expect(edu.store.state.logs.some((l) => l.actor_id === ids.jussara && l.title === 'Comprar frutas')).toBe(true);
  });

  it('trocar quem cozinha arrasta louça/fogão e sono, e chega ao outro celular', async () => {
    const day = '2026-09-26';
    const cook = jus.store.state.instances.find((i) => i.rule_tag === 'cook' && i.date === day)!;
    const other = cook.assignee_ids[0] === ids.eduardo ? ids.jussara : ids.eduardo;
    jus.actions.setAssignees(cook.id, [other]);
    await jus.store.flush();
    await edu.store.pull();
    const dayList = edu.store.state.instances.filter((i) => i.date === day);
    expect(dayList.find((i) => i.rule_tag === 'dishes')!.assignee_ids).toEqual([other]);
    expect(dayList.find((i) => i.rule_tag === 'stove')!.assignee_ids).toEqual([other]);
    expect(dayList.find((i) => i.rule_tag === 'sleep_routine')!.assignee_ids).not.toContain(other);
  });

  it('offline dos dois lados: nada duplica e nada se perde', async () => {
    edu.store.setOnline(false);
    jus.store.setOnline(false);
    edu.actions.ensurePlanned('2026-09-28');
    jus.actions.ensurePlanned('2026-09-28');
    const t = edu.store.state.instances.find((i) => i.title === 'Lavar louça' && i.date === '2026-09-22')!;
    edu.actions.updateInstance(t.id, { notes: 'detergente acabou' });
    jus.actions.complete(t.id);
    edu.store.setOnline(true);
    jus.store.setOnline(true);
    await edu.store.syncNow();
    await jus.store.syncNow();
    await edu.store.syncNow();
    for (const p of [edu, jus]) {
      const x = p.store.state.instances.find((i) => i.id === t.id)!;
      expect(x.status).toBe('done');
      expect(x.notes).toBe('detergente acabou');
      expect(p.store.pendingOps()).toBe(0);
    }
    const { data } = await edu.sb.from('task_instances').select('template_id,occurrence').eq('household_id', hid).not('template_id', 'is', null);
    const keys = (data ?? []).map((r) => `${r.template_id}|${r.occurrence}`);
    expect(new Set(keys).size).toBe(keys.length);
    const view = (s: Store) => s.state.instances.filter((i) => !i.deleted).map((i) => `${i.id}:${i.date}:${i.assignee_ids}:${i.status}`).sort();
    expect(view(jus.store)).toEqual(view(edu.store));
  });

  it('um estranho logado não enxerga nem altera a casa', async () => {
    const x = client(STRANGER);
    const { data } = await x.from('task_instances').select('id').eq('household_id', hid);
    expect(data).toEqual([]);
    const { error } = await x.from('shopping_items').insert({ id: randomId(), household_id: hid, name: 'Hack' });
    expect(error).not.toBeNull();
    const { error: joinErr } = await x.rpc('join_household', { p_code: 'QUALQUER', p_member: ids.eduardo });
    expect(joinErr).not.toBeNull();
  });
});
