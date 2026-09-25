-- =============================================================================
-- Write API: the only way to create or change orders and settings.
--
-- All functions: SECURITY DEFINER, empty search_path, fully qualified names,
-- EXECUTE revoked from public/anon and granted to authenticated only.
--
-- Error convention: `raise exception '<code>'` where <code> is a stable
-- snake_case key the UI translates (src/i18n/en.json -> errors.<code>).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Band classification: the SQL twin of classifyDiscount() in src/lib/money.ts.
-- Integer cross-multiplication (numeric is used only to rule out overflow;
-- every operand is a whole number, so there is no rounding).
-- -----------------------------------------------------------------------------
create or replace function public.discount_band(
  p_discount_cents bigint,
  p_line_value_cents bigint,
  p_sand_max_bp integer,
  p_red_max_bp integer
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_discount_cents = 0 then 'none'
    when p_discount_cents::numeric * 10000 <= p_line_value_cents::numeric * p_sand_max_bp then 'sand'
    when p_discount_cents::numeric * 10000 <= p_line_value_cents::numeric * p_red_max_bp  then 'red'
    else 'blocked'
  end;
$$;

-- Display-only percentage in whole basis points, rounded half-up (194 = 1.94%).
create or replace function public.discount_bp_display(p_discount_cents bigint, p_line_value_cents bigint)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  -- floor((2*d*10000 + v) / (2*v)) with exact integer division = round half-up
  select case when p_line_value_cents = 0 then 0
    else div(2 * p_discount_cents::numeric * 10000 + p_line_value_cents, 2 * p_line_value_cents::numeric)::integer
  end;
$$;

revoke execute on function public.discount_band(bigint, bigint, integer, integer) from public, anon;
revoke execute on function public.discount_bp_display(bigint, bigint) from public, anon;
grant execute on function public.discount_band(bigint, bigint, integer, integer) to authenticated;
grant execute on function public.discount_bp_display(bigint, bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- save_order
-- -----------------------------------------------------------------------------
create or replace function public.save_order(
  p_customer_id uuid,
  p_rate integer,
  p_lines jsonb,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_role         text;
  v_name         text;
  v_settings     public.settings%rowtype;
  v_fingerprint  text;
  v_existing     public.orders%rowtype;
  v_order_id     uuid;
  v_elem         jsonb;
  v_ord          bigint;
  v_product      public.products%rowtype;
  v_product_id   uuid;
  v_quantity     integer;
  v_discount     bigint;
  v_value        bigint;
  v_band         text;
  v_has_pending  boolean := false;
  v_subtotal     bigint := 0;
  v_discount_sum bigint := 0;
  v_now          timestamptz := now();

  a_product_id   uuid[]   := '{}';
  a_sku          text[]   := '{}';
  a_name         text[]   := '{}';
  a_price        bigint[] := '{}';
  a_qty          integer[] := '{}';
  a_value        bigint[] := '{}';
  a_discount     bigint[] := '{}';
  a_bp           integer[] := '{}';
  a_band         text[]   := '{}';
  a_approval     text[]   := '{}';
begin
  -- 1. who is calling --------------------------------------------------------
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.role, p.full_name into v_role, v_name from public.profiles p where p.id = v_uid;
  if v_role is null then
    raise exception 'no_profile' using errcode = '42501';
  end if;

  if p_client_request_id is null then
    raise exception 'client_request_id_required' using errcode = '22023';
  end if;

  -- 2. idempotent retry -------------------------------------------------------
  v_fingerprint := md5(concat_ws('|', p_customer_id::text, p_rate::text, p_lines::text));

  select * into v_existing from public.orders o where o.client_request_id = p_client_request_id;
  if found then
    if v_existing.created_by <> v_uid then
      raise exception 'client_request_id_conflict' using errcode = '23505';
    end if;
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'request_already_saved_differently'
        using errcode = '23505', detail = v_existing.id::text,
              hint = 'This draft was already saved; the stored order is returned in detail.';
    end if;
    return v_existing.id;
  end if;

  -- 3. rules in force now -----------------------------------------------------
  select * into v_settings from public.settings s where s.id;
  if not found then
    raise exception 'settings_missing' using errcode = 'P0001';
  end if;

  if p_rate is null or p_rate < v_settings.min_rate then
    raise exception 'rate_below_minimum'
      using errcode = '22023', detail = v_settings.min_rate::text,
            hint = format('Rate must be at least %s SDG per USD.', v_settings.min_rate);
  end if;

  if p_customer_id is null or not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'customer_not_found' using errcode = '22023';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'no_lines' using errcode = '22023';
  end if;

  if jsonb_array_length(p_lines) > 200 then
    raise exception 'too_many_lines' using errcode = '22023';
  end if;

  -- 4. every line: price from products, never from the client -----------------
  for v_elem, v_ord in select e, o from jsonb_array_elements(p_lines) with ordinality as t(e, o) loop
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'invalid_line' using errcode = '22023', detail = v_ord::text;
    end if;

    if coalesce(v_elem ->> 'product_id', '') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'invalid_line' using errcode = '22023', detail = v_ord::text, hint = 'product_id';
    end if;
    v_product_id := (v_elem ->> 'product_id')::uuid;

    -- whole numbers only, as JSON numbers: no "1.5", no "-1", no strings
    if jsonb_typeof(v_elem -> 'quantity') <> 'number' or (v_elem ->> 'quantity') !~ '^[0-9]{1,6}$' then
      raise exception 'invalid_quantity' using errcode = '22023', detail = v_ord::text;
    end if;
    v_quantity := (v_elem ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > 100000 then
      raise exception 'invalid_quantity' using errcode = '22023', detail = v_ord::text;
    end if;

    if jsonb_typeof(v_elem -> 'discount_cents') <> 'number' or (v_elem ->> 'discount_cents') !~ '^[0-9]{1,15}$' then
      raise exception 'invalid_discount' using errcode = '22023', detail = v_ord::text;
    end if;
    v_discount := (v_elem ->> 'discount_cents')::bigint;

    select * into v_product from public.products p where p.id = v_product_id and p.active;
    if not found then
      raise exception 'product_not_found' using errcode = '22023', detail = v_ord::text;
    end if;

    v_value := v_product.price_cents * v_quantity;

    if v_discount > v_value then
      raise exception 'discount_exceeds_line_value' using errcode = '22023', detail = v_ord::text;
    end if;

    v_band := public.discount_band(v_discount, v_value,
                                   v_settings.discount_sand_max_bp, v_settings.discount_red_max_bp);

    a_product_id := a_product_id || v_product.id;
    a_sku        := a_sku        || v_product.sku;
    a_name       := a_name       || v_product.name;
    a_price      := a_price      || v_product.price_cents;
    a_qty        := a_qty        || v_quantity;
    a_value      := a_value      || v_value;
    a_discount   := a_discount   || v_discount;
    a_bp         := a_bp         || public.discount_bp_display(v_discount, v_value);
    a_band       := a_band       || v_band;

    if v_band = 'blocked' then
      if v_role = 'owner' then
        a_approval := a_approval || 'approved'::text;   -- the owner approves by saving
      else
        a_approval := a_approval || 'pending'::text;    -- a request for approval
        v_has_pending := true;
      end if;
    else
      a_approval := a_approval || 'not_required'::text;
    end if;

    v_subtotal     := v_subtotal + v_value;
    v_discount_sum := v_discount_sum + v_discount;
  end loop;

  -- 5. write, in this one transaction ----------------------------------------
  -- Always inserted as pending first, then confirmed by an UPDATE once the lines
  -- exist: the immutability trigger refuses lines on an already confirmed order.
  begin
    insert into public.orders (
      customer_id, created_by, status, rate,
      discount_sand_max_bp, discount_red_max_bp,
      subtotal_cents, discount_cents, total_cents, total_sdg_piastres,
      client_request_id, request_fingerprint
    ) values (
      p_customer_id, v_uid, 'pending_approval', p_rate,
      v_settings.discount_sand_max_bp, v_settings.discount_red_max_bp,
      v_subtotal, v_discount_sum, v_subtotal - v_discount_sum,
      (v_subtotal - v_discount_sum) * p_rate::bigint,
      p_client_request_id, v_fingerprint
    )
    returning id into v_order_id;
  exception when unique_violation then
    -- a concurrent retry with the same key won the race
    select * into v_existing from public.orders o where o.client_request_id = p_client_request_id;
    if v_existing.created_by = v_uid and v_existing.request_fingerprint = v_fingerprint then
      return v_existing.id;
    end if;
    raise exception 'client_request_id_conflict' using errcode = '23505';
  end;

  insert into public.order_lines (
    order_id, line_no, product_id, product_sku, product_name, unit_price_cents, quantity,
    line_value_cents, discount_cents, line_total_cents, discount_bp_display, band,
    approval_status, approved_by, approved_by_name, approved_at
  )
  select
    v_order_id, t.n::integer, t.product_id, t.sku, t.name, t.price, t.qty,
    t.value, t.discount, t.value - t.discount, t.bp, t.band,
    t.approval,
    case when t.approval = 'approved' then v_uid end,
    case when t.approval = 'approved' then v_name end,
    case when t.approval = 'approved' then v_now end
  from unnest(a_product_id, a_sku, a_name, a_price, a_qty, a_value, a_discount, a_bp, a_band, a_approval)
       with ordinality as t(product_id, sku, name, price, qty, value, discount, bp, band, approval, n);

  if not v_has_pending then
    update public.orders set status = 'confirmed', confirmed_at = v_now where id = v_order_id;
  end if;

  return v_order_id;
end;
$$;

revoke execute on function public.save_order(uuid, integer, jsonb, uuid) from public, anon;
grant execute on function public.save_order(uuid, integer, jsonb, uuid) to authenticated;

comment on function public.save_order(uuid, integer, jsonb, uuid) is
  'Creates an order from {product_id, quantity, discount_cents}[]; any price in the payload is ignored. '
  'Adviser + blocked line -> pending_approval; owner -> blocked lines approved and order confirmed.';

-- -----------------------------------------------------------------------------
-- approve_order_line (owner only)
-- -----------------------------------------------------------------------------
create or replace function public.approve_order_line(p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text;
  v_line    public.order_lines%rowtype;
  v_order   public.orders%rowtype;
  v_now     timestamptz := now();
  v_status  text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select p.full_name into v_name from public.profiles p where p.id = v_uid and p.role = 'owner';
  if not found then
    raise exception 'owner_only' using errcode = '42501';
  end if;

  select * into v_line from public.order_lines l where l.id = p_line_id;
  if not found then
    raise exception 'line_not_found' using errcode = '22023';
  end if;

  -- lock the order first, then the line, so concurrent approvals serialise
  select * into v_order from public.orders o where o.id = v_line.order_id for update;
  select * into v_line from public.order_lines l where l.id = p_line_id for update;

  if v_order.status <> 'pending_approval' then
    raise exception 'order_not_pending' using errcode = '22023';
  end if;
  if v_line.approval_status <> 'pending' then
    raise exception 'line_not_pending' using errcode = '22023';
  end if;

  update public.order_lines
     set approval_status = 'approved', approved_by = v_uid, approved_by_name = v_name, approved_at = v_now
   where id = p_line_id;

  if not exists (
    select 1 from public.order_lines l where l.order_id = v_order.id and l.approval_status = 'pending'
  ) then
    update public.orders set status = 'confirmed', confirmed_at = v_now where id = v_order.id;
    v_status := 'confirmed';
  else
    v_status := 'pending_approval';
  end if;

  return jsonb_build_object('order_id', v_order.id, 'order_status', v_status);
end;
$$;

revoke execute on function public.approve_order_line(uuid) from public, anon;
grant execute on function public.approve_order_line(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- update_settings (owner only). Existing orders keep their own snapshot.
-- -----------------------------------------------------------------------------
create or replace function public.update_settings(
  p_min_rate integer,
  p_default_rate integer,
  p_discount_sand_max_bp integer default null,
  p_discount_red_max_bp integer default null
)
returns public.settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.settings%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'owner') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_min_rate is null or p_min_rate < 1 then
    raise exception 'invalid_rate' using errcode = '22023';
  end if;
  if p_default_rate is null or p_default_rate < p_min_rate then
    raise exception 'default_below_minimum' using errcode = '22023';
  end if;

  update public.settings s set
    min_rate             = p_min_rate,
    default_rate         = p_default_rate,
    discount_sand_max_bp = coalesce(p_discount_sand_max_bp, s.discount_sand_max_bp),
    discount_red_max_bp  = coalesce(p_discount_red_max_bp, s.discount_red_max_bp),
    updated_at           = now(),
    updated_by           = v_uid
  where s.id
  returning * into v_row;

  if not found then
    raise exception 'settings_missing' using errcode = 'P0001';
  end if;

  return v_row;
exception
  when check_violation then
    raise exception 'invalid_thresholds' using errcode = '22023';
end;
$$;

revoke execute on function public.update_settings(integer, integer, integer, integer) from public, anon;
grant execute on function public.update_settings(integer, integer, integer, integer) to authenticated;
