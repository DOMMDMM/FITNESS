-- Execute in Supabase SQL Editor. No passwords or administrative keys are needed in the app.
begin;

create table if not exists public.fitness_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  write_id uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table public.fitness_states enable row level security;
revoke all on public.fitness_states from anon, authenticated;
grant select on public.fitness_states to authenticated;
drop policy if exists fitness_read_own_state on public.fitness_states;
create policy fitness_read_own_state on public.fitness_states
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.fitness_get_state()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_state public.fitness_states%rowtype;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  select * into current_state from public.fitness_states where user_id = auth.uid();
  if not found then return jsonb_build_object('state', null, 'rev', 0, 'wid', null); end if;
  return jsonb_build_object('state', current_state.state, 'rev', current_state.revision, 'wid', current_state.write_id);
end;
$$;

-- The only write path. The owner always comes from the authenticated JWT, never client input.
-- Serialize writes even before the user's first row exists; reject stale revisions atomically.
create or replace function public.fitness_put_state(
  p_state jsonb, p_base_rev bigint default null, p_base_wid text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_state public.fitness_states%rowtype;
  next_rev bigint;
  next_wid uuid := gen_random_uuid();
  document jsonb;
begin
  if owner_id is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
     or (p_state ? 'workouts' and jsonb_typeof(p_state->'workouts') <> 'array')
     or (p_state ? 'routines' and jsonb_typeof(p_state->'routines') <> 'array') then
    raise exception 'Invalid workout document' using errcode = '22023';
  end if;
  if octet_length(p_state::text) > 5242880 then
    raise exception 'Workout document exceeds 5 MB' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into current_state from public.fitness_states where user_id = owner_id;
  if found and (p_base_rev is distinct from current_state.revision
    or (p_base_wid is not null and p_base_wid <> current_state.write_id::text)) then
    return jsonb_build_object('conflict', true, 'state', current_state.state,
      'rev', current_state.revision, 'wid', current_state.write_id);
  end if;
  if current_state.user_id is null and coalesce(p_base_rev, 0) <> 0 then
    return jsonb_build_object('conflict', true, 'state', null, 'rev', 0, 'wid', null);
  end if;
  next_rev := coalesce(current_state.revision, 0) + 1;
  document := (p_state - 'active') || jsonb_build_object('_rev', next_rev, '_wid', next_wid);
  insert into public.fitness_states(user_id, state, revision, write_id)
    values(owner_id, document, next_rev, next_wid)
    on conflict (user_id) do update set state = excluded.state, revision = excluded.revision,
      write_id = excluded.write_id, updated_at = now();
  return jsonb_build_object('ok', true, 'rev', next_rev, 'wid', next_wid, 'ts', document->'_ts');
end;
$$;

revoke all on function public.fitness_get_state() from public, anon;
revoke all on function public.fitness_put_state(jsonb, bigint, text) from public, anon;
grant execute on function public.fitness_get_state() to authenticated;
grant execute on function public.fitness_put_state(jsonb, bigint, text) to authenticated;
commit;
