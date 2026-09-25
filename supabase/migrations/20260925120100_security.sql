-- =============================================================================
-- Row level security and table privileges
--
-- Principle: clients (anon key + user JWT, straight to PostgREST) can only READ,
-- and only what their role allows. Every write goes through SECURITY DEFINER
-- functions that re-derive prices and rules from the database.
--
-- Two independent layers:
--   1. Table privileges: authenticated gets SELECT only; anon gets nothing.
--   2. RLS enabled on every table, with SELECT policies only (no INSERT/UPDATE/
--      DELETE policies exist for anyone), so even if a grant is added by mistake
--      later, writes are still refused.
-- =============================================================================

-- Role helper used by policies and functions ----------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'owner'
  );
$$;

revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Privileges -------------------------------------------------------------------
revoke all on table
  public.profiles, public.settings, public.products, public.customers,
  public.orders, public.order_lines
from anon, authenticated, public;

grant usage on schema public to authenticated;
grant select on table
  public.profiles, public.settings, public.products, public.customers,
  public.orders, public.order_lines
to authenticated;

-- RLS on -----------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.settings    enable row level security;
alter table public.products    enable row level security;
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_lines enable row level security;

-- profiles: own row; owner reads all
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()));

-- reference data: any signed-in user can read
create policy settings_select on public.settings
  for select to authenticated using (true);

create policy products_select on public.products
  for select to authenticated using (true);

create policy customers_select on public.customers
  for select to authenticated using (true);

-- orders: adviser sees her own, owner sees all
create policy orders_select on public.orders
  for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_owner()));

create policy order_lines_select on public.order_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_lines.order_id
        and (o.created_by = (select auth.uid()) or (select public.is_owner()))
    )
  );

-- Deliberately NO insert / update / delete policies on any table.
