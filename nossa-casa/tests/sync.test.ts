// Dois celulares (Eduardo e Jussara) contra o mesmo servidor falso.
// Verifica sincronização em tempo real, funcionamento offline e convergência.
import { describe, expect, it } from 'vitest';
import { Actions } from '../src/data/actions';
import { Store } from '../src/data/store';
import { randomId } from '../src/domain/ids';
import { seedHousehold, seedIds, seedMembers, seedTemplates } from '../src/domain/seed';
import type { TaskInstance } from '../src/domain/types';
import { FakeRemote, FakeServer, MemoryKV } from './fakeRemote';

const TODAY = '2026-09-21'; // segunda-feira
const settle = () => new Promise((r) => setTimeout(r, 80));

function phone(server: FakeServer) {
  const remote = new FakeRemote(server);
  const store = new Store({ kv: new MemoryKV(), namespace: 't', remote });
  const actions = new Actions(store);
  return { remote, store, actions };
}

async function setupFamily() {
  const server = new FakeServer();
  const hid = randomId();
  const ids = seedIds(hid);
  // O que o create_household faz no banco:
  const household = seedHousehold(ids, 'ABCD2345');
  for (const m of seedMembers(ids)) server.table('members').set(m.id, { ...m, updated_at: server.stamp() } as never);
  for (const t of seedTemplates(ids)) server.table('task_templates').set(t.id, { ...t, updated_at: server.stamp() } as never);
  server.table('households').set(hid, { ...household, updated_at: server.stamp() } as never);

  const edu = phone(server);
  const jus = phone(server);
  for (const [p, me] of [[edu, ids.eduardo], [jus, ids.jussara]] as const) {
    await p.store.load();
    p.store.hydrate({ household });
    p.store.setMeta({ meId: me });
    await p.store.pull();
    p.store.startRealtime();
  }
  return { server, ids, edu, jus };
}

const find = (list: TaskInstance[], title: string, date?: string) =>
  list.find((i) => i.title === title && (!date || i.date === date) && !i.deleted);

describe('sincronização entre os dois celulares', () => {
  it('Eduardo e Jussara enxergam a mesma casa', async () => {
    const { edu, jus } = await setupFamily();
    expect(edu.store.state.templates.length).toBeGreaterThan(100);
    expect(jus.store.state.templates.length).toBe(edu.store.state.templates.length);
    expect(jus.store.state.members.map((m) => m.name)).toContain('Inaê');
  });

  it('tarefas geradas e concluídas aparecem imediatamente no outro celular', async () => {
    const { edu, jus, ids } = await setupFamily();
    edu.actions.ensurePlanned(TODAY);
    await edu.store.flush();
    await settle();
    const box = edu.store.state.instances.find((i) => i.title === 'Limpar box')!;
    expect(box).toBeTruthy();
    expect(jus.store.state.instances.find((i) => i.id === box.id)).toBeTruthy();

    edu.actions.complete(box.id);
    await settle();
    await edu.store.flush();
    const seen = jus.store.state.instances.find((i) => i.id === box.id)!;
    expect(seen.status).toBe('done');
    expect(seen.completed_by).toEqual([ids.eduardo]);
    // O histórico registra quem concluiu.
    const log = jus.store.state.logs.find((l) => l.entity_id === box.id && l.action === 'completed');
    expect(log?.actor_id).toBe(ids.eduardo);
  });

  it('lista de compras: Eduardo adiciona Leite, Jussara marca como comprado', async () => {
    const { edu, jus, ids } = await setupFamily();
    edu.actions.addShopping('Leite', '2 caixas');
    await settle();
    await edu.store.flush();
    const leite = jus.store.state.shopping.find((s) => s.name === 'Leite')!;
    expect(leite.quantity).toBe('2 caixas');
    jus.actions.toggleShopping(leite.id);
    await settle();
    await jus.store.flush();
    const e = edu.store.state.shopping.find((s) => s.id === leite.id)!;
    expect(e.bought).toBe(true);
    expect(e.bought_by).toBe(ids.jussara);
  });

  it('sem internet: Jussara continua usando e tudo sincroniza quando a conexão volta', async () => {
    const { edu, jus } = await setupFamily();
    edu.actions.ensurePlanned(TODAY);
    await edu.store.flush();
    await settle();

    jus.remote.online = false;
    jus.store.setOnline(false);
    jus.actions.addShopping('Frutas');
    const task = find(jus.store.state.instances, 'Limpar box')!;
    jus.actions.complete(task.id);
    expect(jus.store.pendingOps()).toBeGreaterThan(0);
    // Enquanto isso Eduardo muda a observação da mesma tarefa.
    edu.actions.updateInstance(task.id, { notes: 'Usar o produto novo' });
    await settle();
    await edu.store.flush();

    jus.remote.online = true;
    jus.store.setOnline(true);
    await settle();
    await jus.store.syncNow();
    await settle();

    expect(jus.store.pendingOps()).toBe(0);
    for (const p of [edu, jus]) {
      const t = p.store.state.instances.find((i) => i.id === task.id)!;
      expect(t.status).toBe('done'); // nada se perdeu:
      expect(t.notes).toBe('Usar o produto novo'); // os dois campos foram preservados
      expect(p.store.state.shopping.some((s) => s.name === 'Frutas')).toBe(true);
    }
  });

  it('os dois celulares planejando offline não duplicam tarefas', async () => {
    const { edu, jus, server } = await setupFamily();
    edu.remote.online = false;
    jus.remote.online = false;
    edu.store.setOnline(false);
    jus.store.setOnline(false);
    edu.actions.ensurePlanned(TODAY);
    jus.actions.ensurePlanned(TODAY);
    edu.remote.online = true;
    jus.remote.online = true;
    edu.store.setOnline(true);
    jus.store.setOnline(true);
    await settle();
    await edu.store.syncNow();
    await jus.store.syncNow();
    await settle();

    const serverRows = [...server.table('task_instances').values()];
    const keys = serverRows.filter((r) => r.template_id).map((r) => `${r.template_id}|${r.occurrence}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Os dois terminam com a mesma visão.
    const view = (s: Store) => s.state.instances.filter((i) => !i.deleted).map((i) => `${i.id}:${i.date}:${i.assignee_ids.join(',')}`).sort();
    expect(view(jus.store)).toEqual(view(edu.store));
  });

  it('trocar quem cozinha arrasta louça e fogão e respeita a rotina de sono (nos dois celulares)', async () => {
    const { edu, jus, ids } = await setupFamily();
    edu.actions.ensurePlanned(TODAY);
    await settle();
    await edu.store.flush();
    const day = '2026-09-26'; // sábado
    const cook = find(edu.store.state.instances, 'Cozinhar', day)!;
    const other = cook.assignee_ids[0] === ids.eduardo ? ids.jussara : ids.eduardo;
    const reasons = jus.actions.setAssignees(cook.id, [other]);
    expect(reasons.length).toBeGreaterThan(0);
    await settle();
    await jus.store.flush();
    for (const p of [edu, jus]) {
      const list = p.store.state.instances;
      expect(find(list, 'Lavar louça', day)!.assignee_ids).toEqual([other]);
      expect(find(list, 'Limpar fogão', day)!.assignee_ids).toEqual([other]);
      expect(find(list, 'Rotina de sono das crianças', day)!.assignee_ids).not.toContain(other);
    }
  });

  it('dados persistem no celular (fechar e abrir o app sem internet)', async () => {
    const kv = new MemoryKV();
    const server = new FakeServer();
    const remote = new FakeRemote(server);
    remote.online = false;
    const s1 = new Store({ kv, namespace: 'x', remote });
    await s1.load();
    const hid = randomId();
    const ids = seedIds(hid);
    s1.hydrate({ household: seedHousehold(ids, null), members: seedMembers(ids), templates: seedTemplates(ids) });
    s1.setOnline(false);
    new Actions(s1).addShopping('Arroz');
    await s1.saveNow();

    const s2 = new Store({ kv, namespace: 'x', remote });
    await s2.load();
    expect(s2.state.shopping.map((x) => x.name)).toEqual(['Arroz']);
    expect(s2.pendingOps()).toBeGreaterThan(0); // continua na fila para enviar depois
  });
});

describe('armazenamento no celular', () => {
  it('guarda as tarefas em pedaços por semana (limite de ~2 MB por item no Android)', async () => {
    const kv = new MemoryKV();
    const s1 = new Store({ kv, namespace: 'y' });
    await s1.load();
    const ids = seedIds(randomId());
    s1.hydrate({ household: seedHousehold(ids, null), members: seedMembers(ids), templates: seedTemplates(ids) });
    const a = new Actions(s1);
    const today = new Date().toISOString().slice(0, 10);
    a.ensurePlanned(today);
    await s1.saveNow();
    const sizes = [...kv.data.values()].map((v) => v.length);
    expect(Math.max(...sizes)).toBeLessThan(1_000_000);
    expect([...kv.data.keys()].filter((k) => k.includes('instances:2')).length).toBeGreaterThanOrEqual(2);
    const s2 = new Store({ kv, namespace: 'y' });
    await s2.load();
    expect(s2.state.instances.length).toBe(s1.state.instances.length);
  });
});
