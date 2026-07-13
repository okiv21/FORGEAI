-- FORGEAI — initial schema
-- Tables linked to auth.users with Row Level Security so each user only ever
-- sees their own rows (policy: user_id = auth.uid()).

-- ---------------------------------------------------------------------------
-- projects: one row per generation run the user saves
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    idea        text not null,
    prd         text,
    db_schema   text,
    code_refs   jsonb not null default '{}'::jsonb,  -- generated code/file refs
    created_at  timestamptz not null default now()
);

create index if not exists projects_user_created_idx
    on public.projects (user_id, created_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects are private to their owner" on public.projects;
create policy "projects are private to their owner"
    on public.projects
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- usage: per-user, per-day generation counter (for capping API usage)
-- ---------------------------------------------------------------------------
create table if not exists public.usage (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    generation_count integer not null default 0,
    date             date not null default current_date,
    unique (user_id, date)
);

alter table public.usage enable row level security;

drop policy if exists "usage is private to its owner" on public.usage;
create policy "usage is private to its owner"
    on public.usage
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Atomically increment today's counter and return the new value. Runs as the
-- caller (security invoker) so RLS still applies.
create or replace function public.increment_usage()
returns integer
language plpgsql
as $$
declare
    new_count integer;
begin
    insert into public.usage (user_id, date, generation_count)
    values (auth.uid(), current_date, 1)
    on conflict (user_id, date)
    do update set generation_count = public.usage.generation_count + 1
    returning generation_count into new_count;
    return new_count;
end;
$$;

-- Server-only, atomic claim for the daily generation limit. The backend first
-- validates the user's JWT, then calls this as service_role. Returning zero
-- means the existing counter was already at the limit; it is never incremented.
create or replace function public.claim_generation(target_user uuid, daily_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    new_count integer;
begin
    if daily_limit < 1 then
        raise exception 'daily_limit must be positive';
    end if;
    insert into public.usage (user_id, date, generation_count)
    values (target_user, current_date, 1)
    on conflict (user_id, date)
    do update set generation_count = public.usage.generation_count + 1
    where public.usage.generation_count < daily_limit
    returning generation_count into new_count;
    return coalesce(new_count, 0);
end;
$$;

revoke all on function public.claim_generation(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_generation(uuid, integer) to service_role;
