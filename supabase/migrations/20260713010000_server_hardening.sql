-- Apply server-side usage enforcement to existing Supabase projects.
-- The API verifies the user's JWT before invoking this function as service_role.
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
