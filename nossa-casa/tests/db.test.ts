// Teste de integração do banco: aplica a migração num Postgres real e verifica
// criação da casa, convite, RLS (um estranho não vê nada), carimbo de autoria,
// sincronização entre Eduardo e Jussara e unicidade das ocorrências.
//
// Rode com:  NC_PG_URL=postgres://postgres@localhost:5499/postgres npm test
// (sem NC_PG_URL o teste é pulado).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomId } from '../src/domain/ids';
import { instanceId } from '../src/domain/planner';
import { seedHousehold, seedIds, seedMembers, seedTemplates } from '../src/domain/seed';

const url = process.env.NC_PG_URL;
const d = url ? describe : describe.skip;

const EDU_USER = '11111111-1111-4111-8111-111111111111';
const JUS_USER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

d('banco Supabase (RLS, convite, autoria)', () => {
  let db: Client;
  const hid = randomId();
  const ids = seedIds(hid);
  let invite = '';

  async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
    await db.query('begin');
    try {
      await db.query(`set local role ${user ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? '']);
      const r = await fn();
      await db.query('commit');
      return r;
    } catch (e) {
      await db.query('rollback');
      throw e;
    }
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    const schema = `nc_test_${Date.now()}`;
    await db.query(`drop schema if exists public cascade; create schema public;`);
    void schema;
    await db.query(readFileSync(join(__dirname, 'sql/supabase_stub.sql'), 'utf8'));
    await db.query(readFileSync(join(__dirname, '../supabase/migrations/001_nossa_casa.sql'), 'utf8'));
    // Rodar a migração duas vezes não pode quebrar (idempotente).
    await db.query(readFileSync(join(__dirname, '../supabase/migrations/001_nossa_casa.sql'), 'utf8'));
  });

  afterAll(async () => {
    await db?.end();
  });

  it('Eduardo cria a casa com todos os dados iniciais', async () => {
    const payload = {
      household: seedHousehold(ids, null),
      members: seedMembers(ids),
      templates: seedTemplates(ids),
      me: ids.eduardo,
    };
    const r = await as(EDU_USER, () => db.query('select public.create_household($1::jsonb) as r', [JSON.stringify(payload)]));
    invite = r.rows[0].r.invite_code;
    expect(invite).toMatch(/^[A-Z2-9]{8}$/);
    const m = await as(EDU_USER, () => db.query('select name, user_id from members order by sort'));
    expect(m.rows.map((x) => x.name)).toEqual(['Eduardo', 'Jussara', 'Inaê', 'Caçula']);
    expect(m.rows[0].user_id).toBe(EDU_USER);
    const t = await as(EDU_USER, () => db.query('select count(*)::int as n from task_templates'));
    expect(t.rows[0].n).toBe(seedTemplates(ids).length);
  });

  it('não dá para criar uma segunda casa no mesmo servidor (o outro celular entra pelo convite)', async () => {
    const other = seedIds(randomId());
    const payload = { household: seedHousehold(other, null), members: seedMembers(other), templates: [], me: other.jussara };
    await expect(as(STRANGER, () => db.query('select public.create_household($1::jsonb)', [JSON.stringify(payload)]))).rejects.toThrow(/Já existe uma casa/);
  });

  it('um estranho não vê nada e não consegue entrar sem o código', async () => {
    const r = await as(STRANGER, () => db.query('select count(*)::int as n from task_templates'));
    expect(r.rows[0].n).toBe(0);
    const h = await as(STRANGER, () => db.query('select count(*)::int as n from households'));
    expect(h.rows[0].n).toBe(0);
    await expect(as(STRANGER, () => db.query(`select public.join_household('ERRADO12', $1)`, [ids.jussara]))).rejects.toThrow(/inválido/);
    await expect(as(null, () => db.query('select * from task_templates'))).rejects.toThrow(/permission denied/);
  });

  it('ninguém se vincula sozinho mexendo na tabela de membros', async () => {
    await expect(as(EDU_USER, () => db.query('update members set user_id = $1 where id = $2', [STRANGER, ids.jussara]))).rejects.toThrow(/vínculo/);
  });

  it('Jussara entra com o código e o convite é encerrado', async () => {
    const lst = await as(JUS_USER, () => db.query('select * from public.invite_members($1)', [invite.toLowerCase()]));
    expect(lst.rows.map((x) => x.name)).toEqual(['Jussara']);
    await as(JUS_USER, () => db.query('select public.join_household($1, $2)', [invite, ids.jussara]));
    const h = await as(JUS_USER, () => db.query('select invite_code from households'));
    expect(h.rows[0].invite_code).toBeNull();
    // O código não serve mais para ninguém.
    await expect(as(STRANGER, () => db.query('select public.join_household($1, $2)', [invite, ids.eduardo]))).rejects.toThrow(/inválido/);
  });

  it('o que Eduardo conclui aparece para Jussara, com autoria carimbada pelo servidor', async () => {
    const tpl = seedTemplates(ids).find((t) => t.title === 'Limpar box')!;
    const id = instanceId(hid, tpl.id, 'W2026-09-21');
    const row = {
      id, household_id: hid, template_id: tpl.id, occurrence: 'W2026-09-21', title: tpl.title, category: tpl.category,
      date: '2026-09-22', assignee_ids: [ids.eduardo], created_by: ids.jussara, // tentativa de falsificar autoria
    };
    await as(EDU_USER, () => db.query(
      `insert into task_instances (id, household_id, template_id, occurrence, title, category, date, assignee_ids, created_by)
       select id, household_id, template_id, occurrence, title, category, date, assignee_ids, created_by
       from jsonb_populate_record(null::task_instances, $1::jsonb)`, [JSON.stringify(row)]));
    await as(EDU_USER, () => db.query(`update task_instances set status='done', completed_by=$2, completed_at=now() where id=$1`, [id, [ids.eduardo]]));
    const seen = await as(JUS_USER, () => db.query('select status, created_by, updated_by from task_instances where id=$1', [id]));
    expect(seen.rows[0]).toEqual({ status: 'done', created_by: ids.eduardo, updated_by: ids.eduardo });
    // A mesma ocorrência gerada pelo celular da Jussara (offline) não duplica.
    const dup = await as(JUS_USER, () => db.query(
      `insert into task_instances (id, household_id, template_id, occurrence, title, category, date, assignee_ids)
       values ($1, $2, $3, 'W2026-09-21', 'Limpar box', 'banheiro', '2026-09-23', $4) on conflict do nothing`,
      [id, hid, tpl.id, [ids.jussara]]));
    expect(dup.rowCount).toBe(0);
  });

  it('lista de compras compartilhada e histórico só em nome próprio', async () => {
    const item = randomId();
    await as(EDU_USER, () => db.query(`insert into shopping_items (id, household_id, name) values ($1, $2, 'Leite')`, [item, hid]));
    const j = await as(JUS_USER, () => db.query('select name, added_by from shopping_items where id=$1', [item]));
    expect(j.rows[0]).toEqual({ name: 'Leite', added_by: ids.eduardo });
    await as(JUS_USER, () => db.query('update shopping_items set bought=true, bought_by=$2 where id=$1', [item, ids.jussara]));
    const e = await as(EDU_USER, () => db.query('select bought from shopping_items where id=$1', [item]));
    expect(e.rows[0].bought).toBe(true);

    await as(JUS_USER, () => db.query(
      `insert into activity_log (id, household_id, actor_id, action, entity, entity_id, title) values ($1,$2,$3,'completed','shopping',$4,'Leite')`,
      [randomId(), hid, ids.jussara, item]));
    await expect(as(JUS_USER, () => db.query(
      `insert into activity_log (id, household_id, actor_id, action, entity, entity_id, title) values ($1,$2,$3,'completed','shopping',$4,'Leite')`,
      [randomId(), hid, ids.eduardo, item]))).rejects.toThrow(/row-level security/);
  });

  it('o estranho não consegue gravar na casa', async () => {
    await expect(as(STRANGER, () => db.query(`insert into shopping_items (id, household_id, name) values ($1, $2, 'Hack')`, [randomId(), hid]))).rejects.toThrow(/row-level security/);
    const u = await as(STRANGER, () => db.query(`update task_templates set title='x' where household_id=$1`, [hid]));
    expect(u.rowCount).toBe(0);
  });

  it('todas as tabelas estão no Realtime', async () => {
    const r = await db.query(`select count(*)::int as n from pg_publication_tables where pubname='supabase_realtime'`);
    expect(r.rows[0].n).toBe(8);
  });
});
