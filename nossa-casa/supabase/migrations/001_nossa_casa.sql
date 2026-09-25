-- =============================================================================
-- Nossa Casa — esquema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (ou `supabase db push`).
--
-- Segurança:
--   * Toda tabela tem RLS: só quem está vinculado a um adulto da casa vê/edita.
--   * A casa é criada por uma função (create_household) e o segundo adulto
--     entra com um código de convite de uso único (join_household).
--   * Quando os dois adultos estão vinculados, o convite é apagado.
--   * Quem criou/alterou é carimbado pelo servidor (não dá para falsificar).
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key,
  name text not null default 'Nossa Casa',
  invite_code text unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid unique,
  name text not null,
  kind text not null check (kind in ('adult', 'child')),
  role text not null default 'admin' check (role in ('admin', 'child')),
  color text not null default '#888888',
  emoji text not null default '🙂',
  schedule jsonb,
  preferences jsonb not null default '{}'::jsonb,
  age int,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists members_household_idx on public.members(household_id);

create table if not exists public.task_templates (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text not null,
  room text,
  kind text not null default 'chore',
  effort int not null default 1 check (effort between 1 and 3),
  minutes int not null default 15 check (minutes > 0),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  recurrence jsonb not null default '{"type":"weekly"}'::jsonb,
  assign_mode text not null default 'auto' check (assign_mode in ('auto', 'fixed', 'shared')),
  assignee_ids uuid[] not null default '{}',
  rule_tag text,
  slot text not null default 'any',
  due_time text,
  points int not null default 0,
  notes text,
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists templates_household_idx on public.task_templates(household_id, updated_at);

create table if not exists public.task_instances (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  template_id uuid references public.task_templates(id) on delete set null,
  occurrence text,
  title text not null,
  category text not null,
  kind text not null default 'chore',
  date date not null,
  due_time text,
  slot text not null default 'any',
  minutes int not null default 15,
  effort int not null default 1,
  priority text not null default 'medium',
  assignee_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'cancelled')),
  completed_by uuid[] not null default '{}',
  completed_at timestamptz,
  group_id uuid,
  rule_tag text,
  locked boolean not null default false,
  postponed_count int not null default 0,
  points int not null default 0,
  actual_seconds int not null default 0,
  timer_started_at timestamptz,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists instances_household_date_idx on public.task_instances(household_id, date);
create index if not exists instances_household_updated_idx on public.task_instances(household_id, updated_at);
-- A mesma ocorrência de uma tarefa recorrente só existe uma vez (mesmo se os dois celulares gerarem offline).
create unique index if not exists instances_occurrence_uq on public.task_instances(template_id, occurrence)
  where template_id is not null and occurrence is not null;

create table if not exists public.shopping_items (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  quantity text,
  note text,
  bought boolean not null default false,
  bought_by uuid,
  bought_at timestamptz,
  added_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists shopping_household_idx on public.shopping_items(household_id, updated_at);

create table if not exists public.homework (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.members(id) on delete cascade,
  activity text not null,
  subject text,
  due_date date,
  note text,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists homework_household_idx on public.homework(household_id, updated_at);

create table if not exists public.family_events (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null default 'outing' check (type in ('outing', 'appointment')),
  title text not null,
  place_type text,
  date date not null,
  time text,
  participant_ids uuid[] not null default '{}',
  notes text,
  done boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists events_household_idx on public.family_events(household_id, updated_at);

create table if not exists public.activity_log (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  title text not null,
  category text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists log_household_idx on public.activity_log(household_id, created_at desc);
create index if not exists log_household_updated_idx on public.activity_log(household_id, updated_at);

-- ---------------------------------------------------------------------------
-- Funções auxiliares de segurança
-- ---------------------------------------------------------------------------
create or replace function public.my_household_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select household_id from public.members where user_id = auth.uid() and not deleted
$$;

create or replace function public.my_member_id(p_household uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.members where user_id = auth.uid() and household_id = p_household and not deleted limit 1
$$;

-- Carimba updated_at (hora do servidor) e quem criou/alterou.
create or replace function public.nc_stamp()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  me uuid;
  j jsonb := to_jsonb(new);
begin
  new.updated_at := now();
  if auth.uid() is not null then
    me := public.my_member_id(new.household_id);
    if tg_op = 'INSERT' then
      if j ? 'created_by' and me is not null then
        new := jsonb_populate_record(new, jsonb_build_object('created_by', me));
      end if;
      if j ? 'added_by' and me is not null and (j->>'added_by') is null then
        new := jsonb_populate_record(new, jsonb_build_object('added_by', me));
      end if;
    end if;
    if j ? 'updated_by' and me is not null then
      new := jsonb_populate_record(new, jsonb_build_object('updated_by', me));
    end if;
  end if;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['households','members','task_templates','task_instances','shopping_items','homework','family_events','activity_log'] loop
    execute format('drop trigger if exists nc_stamp on public.%I', t);
    execute format('create trigger nc_stamp before insert or update on public.%I for each row execute function public.nc_stamp()', t);
  end loop;
end $$;

-- households não têm household_id: carimbo simples.
create or replace function public.nc_stamp_household()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists nc_stamp on public.households;
create trigger nc_stamp before insert or update on public.households
  for each row execute function public.nc_stamp_household();

-- Ninguém troca o dono (user_id) de um membro, exceto as funções de vínculo.
create or replace function public.nc_guard_member()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id and coalesce(current_setting('nc.allow_link', true), '') <> 'on' then
    raise exception 'Não é permitido alterar o vínculo de login de um membro.';
  end if;
  if new.household_id is distinct from old.household_id then
    raise exception 'Não é permitido mover um membro para outra casa.';
  end if;
  return new;
end $$;
drop trigger if exists nc_guard_member on public.members;
create trigger nc_guard_member before update on public.members
  for each row execute function public.nc_guard_member();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_instances enable row level security;
alter table public.shopping_items enable row level security;
alter table public.homework enable row level security;
alter table public.family_events enable row level security;
alter table public.activity_log enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated
  using (id in (select public.my_household_ids()));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated
  using (id in (select public.my_household_ids()))
  with check (id in (select public.my_household_ids()));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (household_id in (select public.my_household_ids()));
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated
  with check (household_id in (select public.my_household_ids()) and user_id is null);
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));

do $$
declare t text;
begin
  foreach t in array array['task_templates','task_instances','shopping_items','homework','family_events'] loop
    execute format('drop policy if exists %1$s_all on public.%1$I', t);
    execute format(
      'create policy %1$s_all on public.%1$I for all to authenticated
         using (household_id in (select public.my_household_ids()))
         with check (household_id in (select public.my_household_ids()))', t);
  end loop;
end $$;

-- Histórico: lê a casa toda; só grava em nome de si mesmo; não edita nem apaga.
drop policy if exists log_select on public.activity_log;
create policy log_select on public.activity_log for select to authenticated
  using (household_id in (select public.my_household_ids()));
drop policy if exists log_insert on public.activity_log;
create policy log_insert on public.activity_log for insert to authenticated
  with check (household_id in (select public.my_household_ids()) and actor_id = public.my_member_id(household_id));

-- Nada é acessível sem login.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Criar a casa e entrar nela
-- ---------------------------------------------------------------------------
create or replace function public.nc_new_invite()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8)
$$;

-- p = { household: {...}, members: [...], templates: [...], me: <member uuid> }
create or replace function public.create_household(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  hid uuid := (p->'household'->>'id')::uuid;
  me uuid := (p->>'me')::uuid;
  code text := public.nc_new_invite();
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Este login já pertence a uma casa.';
  end if;

  insert into public.households (id, name, invite_code, settings)
  values (hid, coalesce(p->'household'->>'name', 'Nossa Casa'), code, coalesce(p->'household'->'settings', '{}'::jsonb));

  insert into public.members
  select * from jsonb_populate_recordset(null::public.members, p->'members') r
  where r.household_id = hid;
  update public.members set user_id = null where household_id = hid;

  perform set_config('nc.allow_link', 'on', true);
  update public.members set user_id = auth.uid() where id = me and household_id = hid and kind = 'adult';
  if not found then raise exception 'Adulto inválido.'; end if;

  insert into public.task_templates
  select * from jsonb_populate_recordset(null::public.task_templates, p->'templates') r
  where r.household_id = hid;

  return jsonb_build_object('household_id', hid, 'invite_code', code);
end
$$;

create or replace function public.join_household(p_code text, p_member uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Este login já pertence a uma casa.';
  end if;
  select id into hid from public.households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'Código de convite inválido ou já utilizado.'; end if;

  perform set_config('nc.allow_link', 'on', true);
  update public.members set user_id = auth.uid()
   where id = p_member and household_id = hid and kind = 'adult' and user_id is null and not deleted;
  if not found then raise exception 'Esse adulto já tem login ou não existe.'; end if;

  -- Todos os adultos vinculados? Fecha a porta.
  if not exists (select 1 from public.members where household_id = hid and kind = 'adult' and user_id is null and not deleted) then
    update public.households set invite_code = null where id = hid;
  end if;
  return jsonb_build_object('household_id', hid);
end
$$;

-- Lista os adultos ainda sem login de um convite (para a tela "Entrar com código").
create or replace function public.invite_members(p_code text)
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.name from public.members m
  join public.households h on h.id = m.household_id
  where h.invite_code = upper(trim(p_code)) and m.kind = 'adult' and m.user_id is null and not m.deleted
  order by m.sort
$$;

-- Gera um novo convite (ex.: celular trocado). Só quem já é da casa.
create or replace function public.renew_invite(p_household uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare code text := public.nc_new_invite();
begin
  if p_household not in (select public.my_household_ids()) then raise exception 'Sem permissão.'; end if;
  update public.households set invite_code = code where id = p_household;
  return code;
end
$$;

-- Libera um adulto para entrar de novo (ex.: trocou de conta). Só quem já é da casa.
create or replace function public.unlink_member(p_member uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.members where id = p_member and household_id in (select public.my_household_ids())) then
    raise exception 'Sem permissão.';
  end if;
  if p_member = public.my_member_id((select household_id from public.members where id = p_member)) then
    raise exception 'Você não pode desvincular a si mesmo.';
  end if;
  perform set_config('nc.allow_link', 'on', true);
  update public.members set user_id = null where id = p_member;
end
$$;

revoke all on function public.create_household(jsonb) from public, anon;
revoke all on function public.join_household(text, uuid) from public, anon;
revoke all on function public.invite_members(text) from public, anon;
revoke all on function public.renew_invite(uuid) from public, anon;
revoke all on function public.unlink_member(uuid) from public, anon;
grant execute on function public.create_household(jsonb) to authenticated;
grant execute on function public.join_household(text, uuid) to authenticated;
grant execute on function public.invite_members(text) to authenticated;
grant execute on function public.renew_invite(uuid) to authenticated;
grant execute on function public.unlink_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real (Supabase Realtime)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['households','members','task_templates','task_instances','shopping_items','homework','family_events','activity_log'] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
