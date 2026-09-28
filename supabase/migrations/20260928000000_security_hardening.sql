-- =============================================================================
-- Security hardening
--
-- 1. New sign-ups get NO access. A new auth user receives role 'pending' and
--    can read nothing and write nothing until the owner (via the service role)
--    assigns 'adviser' or 'owner'. Even if public sign-up is left enabled in
--    Supabase Auth, a stranger who registers cannot see prices, dealers or
--    orders, and cannot call save_order.
-- 2. Reference data (products, customers, settings) is readable by members
--    only (owner/adviser), not by any authenticated user.
-- 3. save_order requires an explicit member role.
-- 4. Explicit EXECUTE allowlist: internal helper functions are not callable
--    through the API at all.
-- =============================================================================

-- 1. roles -----------------------------------------------------------------------
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'adviser', 'pending'));
alter table public.profiles alter column role set default 'pending';

comment on column public.profiles.role is
  'owner | adviser | pending. New sign-ups are pending (no access) until a role is assigned with the service role.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. membership helper and tighter read policies ---------------------------------
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('owner', 'adviser')
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

drop policy settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated using ((select public.is_member()));

drop policy products_select on public.products;
create policy products_select on public.products
  for select to authenticated using ((select public.is_member()));

drop policy customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using ((select public.is_member()));

drop policy orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using ((select public.is_member()) and (created_by = (select auth.uid()) or (select public.is_owner())));

-- 3. save_order: members only ------------------------------------------------------
-- Re-declared with one change: the caller's role must be owner or adviser.
do $do$
declare
  v_def text;
begin
  select pg_get_functiondef('public.save_order(uuid, integer, jsonb, uuid)'::regprocedure) into v_def;
  v_def := replace(
    v_def,
    $old$  if v_role is null then
    raise exception 'no_profile' using errcode = '42501';
  end if;$old$,
    $new$  if v_role is null then
    raise exception 'no_profile' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'adviser') then
    raise exception 'no_access' using errcode = '42501';
  end if;$new$
  );
  if position('no_access' in v_def) = 0 then
    raise exception 'save_order hardening patch did not apply';
  end if;
  execute v_def;
end;
$do$;

revoke execute on function public.save_order(uuid, integer, jsonb, uuid) from public, anon;
grant execute on function public.save_order(uuid, integer, jsonb, uuid) to authenticated;

-- 4. EXECUTE allowlist ---------------------------------------------------------------
-- The pure maths helpers are only used inside save_order; nobody needs them via the API.
revoke execute on function public.discount_band(bigint, bigint, integer, integer) from public, anon, authenticated;
revoke execute on function public.discount_bp_display(bigint, bigint) from public, anon, authenticated;

-- Future functions in public are not executable by API roles unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
