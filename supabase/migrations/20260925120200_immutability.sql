-- =============================================================================
-- Immutability guards: a second line of defence.
--
-- Even the SECURITY DEFINER functions (and any future code, or a developer with
-- the service role) cannot rewrite history:
--   * orders and order_lines can never be deleted or truncated;
--   * a confirmed order and its lines can never be updated;
--   * on a pending order the only allowed change is pending_approval -> confirmed;
--   * on a pending line the only allowed change is pending -> approved (+ who/when);
--   * no line can be added to a confirmed order;
--   * an order can only become confirmed when none of its lines is pending;
--   * at commit, order totals must equal the sum of their lines.
-- =============================================================================

create or replace function public.guard_orders_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'orders_are_append_only'
      using errcode = 'P0001', detail = 'Orders can never be deleted.';
  end if;

  -- tg_op = 'UPDATE'
  if old.status = 'confirmed' then
    raise exception 'order_is_immutable'
      using errcode = 'P0001', detail = format('Order %s is confirmed and can never change.', old.id);
  end if;

  if (new.id, new.order_number, new.customer_id, new.created_by, new.created_at,
      new.rate, new.discount_sand_max_bp, new.discount_red_max_bp,
      new.subtotal_cents, new.discount_cents, new.total_cents, new.total_sdg_piastres,
      new.client_request_id, new.request_fingerprint)
     is distinct from
     (old.id, old.order_number, old.customer_id, old.created_by, old.created_at,
      old.rate, old.discount_sand_max_bp, old.discount_red_max_bp,
      old.subtotal_cents, old.discount_cents, old.total_cents, old.total_sdg_piastres,
      old.client_request_id, old.request_fingerprint)
  then
    raise exception 'order_is_immutable'
      using errcode = 'P0001', detail = 'Only the status of a pending order may change.';
  end if;

  if new.status is distinct from old.status then
    if not (old.status = 'pending_approval' and new.status = 'confirmed') then
      raise exception 'invalid_status_transition'
        using errcode = 'P0001', detail = format('%s -> %s', old.status, new.status);
    end if;
    if exists (select 1 from public.order_lines l where l.order_id = new.id and l.approval_status = 'pending') then
      raise exception 'order_has_pending_lines'
        using errcode = 'P0001', detail = 'All blocked lines must be approved before the order is confirmed.';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_immutable
  before update or delete on public.orders
  for each row execute function public.guard_orders_immutable();

create or replace function public.guard_order_lines_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'orders_are_append_only'
      using errcode = 'P0001', detail = 'Order lines can never be deleted.';
  end if;

  select o.status into v_status from public.orders o where o.id = new.order_id;

  if v_status = 'confirmed' then
    raise exception 'order_is_immutable'
      using errcode = 'P0001', detail = 'Lines of a confirmed order can never change.';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- tg_op = 'UPDATE': only pending -> approved, with approver and time
  if (new.id, new.order_id, new.line_no, new.product_id, new.product_sku, new.product_name,
      new.unit_price_cents, new.quantity, new.line_value_cents, new.discount_cents,
      new.line_total_cents, new.discount_bp_display, new.band)
     is distinct from
     (old.id, old.order_id, old.line_no, old.product_id, old.product_sku, old.product_name,
      old.unit_price_cents, old.quantity, old.line_value_cents, old.discount_cents,
      old.line_total_cents, old.discount_bp_display, old.band)
  then
    raise exception 'order_is_immutable'
      using errcode = 'P0001', detail = 'Only the approval of a pending line may change.';
  end if;

  if not (old.approval_status = 'pending' and new.approval_status = 'approved') then
    raise exception 'invalid_approval_transition'
      using errcode = 'P0001', detail = format('%s -> %s', old.approval_status, new.approval_status);
  end if;

  return new;
end;
$$;

create trigger order_lines_immutable
  before insert or update or delete on public.order_lines
  for each row execute function public.guard_order_lines_immutable();

-- No TRUNCATE either.
create or replace function public.guard_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'orders_are_append_only' using errcode = 'P0001', detail = 'TRUNCATE is not allowed.';
end;
$$;

create trigger orders_no_truncate
  before truncate on public.orders
  for each statement execute function public.guard_no_truncate();

create trigger order_lines_no_truncate
  before truncate on public.order_lines
  for each statement execute function public.guard_no_truncate();

-- Totals must equal the sum of the lines, checked at commit ------------------
create or replace function public.check_order_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count    integer;
  v_subtotal bigint;
  v_discount bigint;
begin
  select count(*), coalesce(sum(l.line_value_cents), 0), coalesce(sum(l.discount_cents), 0)
    into v_count, v_subtotal, v_discount
  from public.order_lines l
  where l.order_id = new.id;

  if v_count = 0 then
    raise exception 'order_without_lines' using errcode = 'P0001';
  end if;

  if v_subtotal <> new.subtotal_cents or v_discount <> new.discount_cents then
    raise exception 'order_totals_mismatch'
      using errcode = 'P0001',
            detail = format('order %s: lines sum to %s/%s, order says %s/%s',
                            new.id, v_subtotal, v_discount, new.subtotal_cents, new.discount_cents);
  end if;

  return null;
end;
$$;

create constraint trigger orders_totals_match_lines
  after insert on public.orders
  deferrable initially deferred
  for each row execute function public.check_order_totals();

revoke execute on function public.guard_orders_immutable()      from public, anon, authenticated;
revoke execute on function public.guard_order_lines_immutable() from public, anon, authenticated;
revoke execute on function public.guard_no_truncate()           from public, anon, authenticated;
revoke execute on function public.check_order_totals()          from public, anon, authenticated;
