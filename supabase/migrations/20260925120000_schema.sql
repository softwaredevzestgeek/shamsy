-- =============================================================================
-- Shamsy: order recording — schema
--
-- Money conventions (enforced by types and check constraints):
--   * USD amounts are integer cents (bigint). Never numeric with decimals, never float.
--   * The exchange rate is an integer: SDG per 1 USD.
--   * SDG amounts are integer piastres (1/100 SDG): total_sdg_piastres = total_cents * rate.
--     This is exact integer arithmetic; no rounding is ever needed.
--   * Every value on an order and its lines is a snapshot taken at save time.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: one per auth user, carries the role
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        text not null default 'adviser' check (role in ('owner', 'adviser')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Role is only changeable with the service role (no update policy).';

-- ---------------------------------------------------------------------------
-- settings: exactly one row
-- ---------------------------------------------------------------------------
create table public.settings (
  id                    boolean primary key default true check (id),
  min_rate              integer not null check (min_rate >= 1),
  default_rate          integer not null check (default_rate >= 1),
  discount_sand_max_bp  integer not null check (discount_sand_max_bp between 0 and 10000),
  discount_red_max_bp   integer not null check (discount_red_max_bp between 0 and 10000),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id),
  constraint settings_default_not_below_min check (default_rate >= min_rate),
  constraint settings_bands_ordered check (discount_sand_max_bp <= discount_red_max_bp)
);

comment on table public.settings is 'Single-row configuration. Thresholds in basis points (300 = 3.00%). Only affects orders saved after a change.';

-- ---------------------------------------------------------------------------
-- products and customers
-- ---------------------------------------------------------------------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  sku          text not null unique,
  name         text not null,
  price_cents  bigint not null check (price_cents > 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         bigint generated always as identity (start with 1001) unique,
  customer_id          uuid not null references public.customers (id),
  created_by           uuid not null references public.profiles (id),
  created_at           timestamptz not null default now(),
  status               text not null check (status in ('pending_approval', 'confirmed')),
  confirmed_at         timestamptz,

  -- snapshot of the rate and of the rules in force when the order was saved
  rate                 integer not null check (rate >= 1),
  discount_sand_max_bp integer not null check (discount_sand_max_bp between 0 and 10000),
  discount_red_max_bp  integer not null check (discount_red_max_bp between 0 and 10000),

  -- snapshot totals
  subtotal_cents       bigint not null check (subtotal_cents >= 0),
  discount_cents       bigint not null check (discount_cents >= 0),
  total_cents          bigint not null check (total_cents >= 0),
  total_sdg_piastres   bigint not null check (total_sdg_piastres >= 0),

  -- idempotency for retries on weak connections
  client_request_id    uuid not null unique,
  request_fingerprint  text not null,

  constraint orders_discount_le_subtotal check (discount_cents <= subtotal_cents),
  constraint orders_total_consistent     check (total_cents = subtotal_cents - discount_cents),
  constraint orders_sdg_consistent       check (total_sdg_piastres = total_cents * rate::bigint),
  constraint orders_confirmed_at_matches check ((status = 'confirmed') = (confirmed_at is not null))
);

create index orders_created_by_idx on public.orders (created_by, created_at desc);
create index orders_customer_idx   on public.orders (customer_id);

comment on column public.orders.rate is 'SDG per 1 USD entered for this order. Never looked up again.';
comment on column public.orders.total_sdg_piastres is 'total_cents * rate, exact. Display as whole SDG (divide by 100 only when formatting).';
comment on column public.orders.request_fingerprint is 'md5 of the save_order payload; the same client_request_id with a different payload is refused.';

-- ---------------------------------------------------------------------------
-- order_lines
-- ---------------------------------------------------------------------------
create table public.order_lines (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete restrict,
  line_no              integer not null check (line_no >= 1),
  product_id           uuid not null references public.products (id),

  -- snapshots from products at save time
  product_sku          text not null,
  product_name         text not null,
  unit_price_cents     bigint not null check (unit_price_cents > 0),

  quantity             integer not null check (quantity > 0 and quantity <= 100000),
  line_value_cents     bigint not null check (line_value_cents > 0),
  discount_cents       bigint not null check (discount_cents >= 0),
  line_total_cents     bigint not null check (line_total_cents >= 0),
  discount_bp_display  integer not null check (discount_bp_display between 0 and 10000),
  band                 text not null check (band in ('none', 'sand', 'red', 'blocked')),

  approval_status      text not null check (approval_status in ('not_required', 'pending', 'approved')),
  approved_by          uuid references public.profiles (id),
  approved_by_name     text,
  approved_at          timestamptz,

  unique (order_id, line_no),
  constraint lines_value_consistent   check (line_value_cents = unit_price_cents * quantity::bigint),
  constraint lines_discount_le_value  check (discount_cents <= line_value_cents),
  constraint lines_total_consistent   check (line_total_cents = line_value_cents - discount_cents),
  constraint lines_band_none_iff_zero check ((band = 'none') = (discount_cents = 0)),
  constraint lines_approval_iff_blocked check ((band = 'blocked') = (approval_status <> 'not_required')),
  constraint lines_approved_has_approver check (
    (approval_status = 'approved') = (approved_by is not null and approved_at is not null)
  )
);

create index order_lines_order_idx   on public.order_lines (order_id);
create index order_lines_pending_idx on public.order_lines (approval_status) where approval_status = 'pending';

comment on column public.order_lines.discount_bp_display is 'Discount as whole basis points rounded half-up (194 = 1.94%). Display only; the band is decided by exact cross-multiplication.';
comment on column public.order_lines.approved_by_name is 'Snapshot of the approver name so an adviser can see who approved without reading other profiles.';

-- ---------------------------------------------------------------------------
-- New auth user -> adviser profile
-- ---------------------------------------------------------------------------
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
    'adviser'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
