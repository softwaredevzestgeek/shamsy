-- pgTAP tests for the order rules. Run with `npm run test:db` (needs `supabase start`).
-- Everything runs in one transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------- fixtures
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated',
   'pgtap-adviser@shamsy.test', '{"full_name":"Test Adviser"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated',
   'pgtap-owner@shamsy.test', '{"full_name":"Test Owner"}', now(), now());

select is((select role from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a'),
          'adviser', 'new auth user gets an adviser profile');

update public.profiles set role = 'owner' where id = 'b0000000-0000-4000-8000-00000000000b';

insert into public.settings (id, min_rate, default_rate, discount_sand_max_bp, discount_red_max_bp)
values (true, 8000, 8000, 300, 500)
on conflict (id) do update set min_rate = 8000, default_rate = 8000, discount_sand_max_bp = 300, discount_red_max_bp = 500;

insert into public.products (sku, name, price_cents) values
  ('T-SPF', 'SPF 6000 ES Plus', 51500),
  ('T-H5',  'Hope 5.0L-B1',     81000),
  ('T-H16', 'Hope 16.0LM-A1',  207000);
insert into public.customers (id, name, city) values ('d0000000-0000-4000-8000-00000000000d', 'Test Dealer', 'Khartoum');

select set_config('t.spf', (select id::text from public.products where sku = 'T-SPF'), true);
select set_config('t.h5',  (select id::text from public.products where sku = 'T-H5'),  true);
select set_config('t.h16', (select id::text from public.products where sku = 'T-H16'), true);
select set_config('t.lines12', jsonb_build_array(
  jsonb_build_object('product_id', current_setting('t.spf'), 'quantity', 4, 'discount_cents', 4000),
  jsonb_build_object('product_id', current_setting('t.h5'),  'quantity', 2, 'discount_cents', 7000))::text, true);
select set_config('t.lines123', jsonb_build_array(
  jsonb_build_object('product_id', current_setting('t.spf'), 'quantity', 4, 'discount_cents', 4000),
  jsonb_build_object('product_id', current_setting('t.h5'),  'quantity', 2, 'discount_cents', 7000),
  jsonb_build_object('product_id', current_setting('t.h16'), 'quantity', 1, 'discount_cents', 15000))::text, true);

-- ---------------------------------------------------------------- SQL twin of money.ts
select is(public.discount_band(0,     100000, 300, 500), 'none',    '0% is none');
select is(public.discount_band(3000,  100000, 300, 500), 'sand',    'exactly 3.00% is sand');
select is(public.discount_band(3001,  100000, 300, 500), 'red',     'just above 3% is red');
select is(public.discount_band(5000,  100000, 300, 500), 'red',     'exactly 5.00% is red');
select is(public.discount_band(5001,  100000, 300, 500), 'blocked', 'just above 5% is blocked');
select is(public.discount_bp_display(4000,  206000), 194, '$40 on $2,060 is 1.94%');
select is(public.discount_bp_display(7000,  162000), 432, '$70 on $1,620 is 4.32%');
select is(public.discount_bp_display(15000, 207000), 725, '$150 on $2,070 is 7.25%');
select is(public.discount_bp_display(1, 20000), 1, 'display rounds half-up');

-- ---------------------------------------------------------------- as the adviser
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

-- 1. lines 1 + 2 at 8,200 -> confirmed, $3,570, 29,274,000 SDG
select set_config('t.o1', public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  current_setting('t.lines12')::jsonb, 'e0000000-0000-4000-8000-000000000001')::text, true);
select is((select status from public.orders where id = current_setting('t.o1')::uuid), 'confirmed', 'adviser order without blocked line is confirmed');
select is((select total_cents from public.orders where id = current_setting('t.o1')::uuid), 357000::bigint, 'total is 357000 cents');
select is((select total_sdg_piastres from public.orders where id = current_setting('t.o1')::uuid), 2927400000::bigint, 'total is 29,274,000 SDG');
select results_eq(
  $$select band, discount_bp_display from public.order_lines where order_id = current_setting('t.o1')::uuid order by line_no$$,
  $$values ('sand'::text, 194), ('red'::text, 432)$$,
  'bands and percentages are stored');

-- 2. all three lines -> pending approval
select set_config('t.o2', public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  current_setting('t.lines123')::jsonb, 'e0000000-0000-4000-8000-000000000002')::text, true);
select is((select status from public.orders where id = current_setting('t.o2')::uuid), 'pending_approval', 'blocked line -> pending approval');
select is((select confirmed_at from public.orders where id = current_setting('t.o2')::uuid), null, 'pending order is not confirmed');
select set_config('t.l3', (select id::text from public.order_lines where order_id = current_setting('t.o2')::uuid and line_no = 3), true);
select is((select approval_status from public.order_lines where id = current_setting('t.l3')::uuid), 'pending', 'blocked line is pending');

-- 3. adviser cannot approve
select throws_ok($$select public.approve_order_line(current_setting('t.l3')::uuid)$$, '42501', 'owner_only', 'adviser cannot approve');

-- 4. no direct writes
select throws_ok($$insert into public.orders (customer_id, created_by, status, rate, discount_sand_max_bp, discount_red_max_bp,
  subtotal_cents, discount_cents, total_cents, total_sdg_piastres, client_request_id, request_fingerprint)
  values ('d0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000a', 'confirmed', 8200, 300, 500,
  1, 0, 1, 8200, gen_random_uuid(), 'x')$$, '42501', null, 'direct insert into orders refused');
select throws_ok($$insert into public.order_lines (order_id, line_no, product_id, product_sku, product_name, unit_price_cents,
  quantity, line_value_cents, discount_cents, line_total_cents, discount_bp_display, band, approval_status)
  values (current_setting('t.o2')::uuid, 9, current_setting('t.h16')::uuid, 'x', 'x', 1, 1, 1, 0, 1, 0, 'none', 'not_required')$$,
  '42501', null, 'direct insert into order_lines refused');

-- 5. no direct updates / deletes
select throws_ok($$update public.order_lines set discount_cents = 0 where id = current_setting('t.l3')::uuid$$, '42501', null, 'direct discount update refused');
select throws_ok($$update public.order_lines set approval_status = 'approved' where id = current_setting('t.l3')::uuid$$, '42501', null, 'direct approval refused');
select throws_ok($$delete from public.orders where id = current_setting('t.o1')::uuid$$, '42501', null, 'direct delete refused');
select throws_ok($$update public.settings set min_rate = 1$$, '42501', null, 'direct settings update refused');
select throws_ok($$update public.profiles set role = 'owner' where id = auth.uid()$$, '42501', null, 'adviser cannot promote herself');
select throws_ok($$select public.update_settings(1, 1)$$, '42501', 'owner_only', 'adviser cannot call update_settings');

-- 6. rate below minimum
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 7900,
  current_setting('t.lines12')::jsonb, gen_random_uuid())$$, '22023', 'rate_below_minimum', 'rate 7,900 refused');

-- 7. manipulated price ignored
select set_config('t.o7', public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  jsonb_build_array(jsonb_build_object('product_id', current_setting('t.spf'), 'quantity', 1, 'discount_cents', 0,
                                       'unit_price_cents', 1, 'price_cents', 1)),
  gen_random_uuid())::text, true);
select is((select unit_price_cents from public.order_lines where order_id = current_setting('t.o7')::uuid), 51500::bigint, 'client price ignored');

-- other input checks
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  jsonb_build_array(jsonb_build_object('product_id', current_setting('t.spf'), 'quantity', 1, 'discount_cents', 51501)),
  gen_random_uuid())$$, '22023', 'discount_exceeds_line_value', 'discount above line value refused');
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  jsonb_build_array(jsonb_build_object('product_id', current_setting('t.spf'), 'quantity', 1.5, 'discount_cents', 0)),
  gen_random_uuid())$$, '22023', 'invalid_quantity', 'fractional quantity refused');
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  jsonb_build_array(jsonb_build_object('product_id', current_setting('t.spf'), 'quantity', 1, 'discount_cents', -1)),
  gen_random_uuid())$$, '22023', 'invalid_discount', 'negative discount refused');
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 8200, '[]'::jsonb, gen_random_uuid())$$,
  '22023', 'no_lines', 'empty order refused');

-- 10. idempotency
select is(public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  current_setting('t.lines12')::jsonb, 'e0000000-0000-4000-8000-000000000001'), current_setting('t.o1')::uuid,
  'same client_request_id returns the same order');
select is((select count(*) from public.orders where client_request_id = 'e0000000-0000-4000-8000-000000000001'), 1::bigint,
  'only one order for that client_request_id');
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 9999,
  current_setting('t.lines12')::jsonb, 'e0000000-0000-4000-8000-000000000001')$$, '23505', 'request_already_saved_differently',
  'same key with a different payload refused');

-- ---------------------------------------------------------------- as the owner
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

-- 8. approve line 3 -> confirmed, $5,490, 45,018,000 SDG, rate 8,200
select is(public.approve_order_line(current_setting('t.l3')::uuid) ->> 'order_status', 'confirmed', 'owner approval confirms the order');
select is((select total_cents from public.orders where id = current_setting('t.o2')::uuid), 549000::bigint, 'total is 549000 cents');
select is((select total_sdg_piastres from public.orders where id = current_setting('t.o2')::uuid), 4501800000::bigint, 'total is 45,018,000 SDG');
select is((select approved_by_name from public.order_lines where id = current_setting('t.l3')::uuid), 'Test Owner', 'approver recorded');
select throws_ok($$select public.approve_order_line(current_setting('t.l3')::uuid)$$, '22023', 'order_not_pending', 'cannot approve twice');

-- 9. settings change does not touch saved orders
select lives_ok($$select public.update_settings(9000, 9000)$$, 'owner updates settings');
select results_eq(
  $$select rate, total_sdg_piastres from public.orders where id = current_setting('t.o2')::uuid$$,
  $$values (8200, 4501800000::bigint)$$,
  'saved order keeps rate 8,200 and 45,018,000 SDG after min rate goes to 9,000');
select throws_ok($$select public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  current_setting('t.lines12')::jsonb, gen_random_uuid())$$, '22023', 'rate_below_minimum', 'new minimum applies to new orders');
select lives_ok($$select public.update_settings(8000, 8000)$$, 'settings restored');

-- owner saving a blocked line approves it himself
select set_config('t.o3', public.save_order('d0000000-0000-4000-8000-00000000000d', 8200,
  current_setting('t.lines123')::jsonb, gen_random_uuid())::text, true);
select is((select status from public.orders where id = current_setting('t.o3')::uuid), 'confirmed', 'owner order with blocked line is confirmed');
select is((select approved_by from public.order_lines where order_id = current_setting('t.o3')::uuid and line_no = 3),
  'b0000000-0000-4000-8000-00000000000b'::uuid, 'owner is recorded as approver');

-- adviser cannot see the owner's order
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.orders where id = current_setting('t.o3')::uuid), 0::bigint, 'adviser cannot read other users orders');
select is((select count(*) from public.order_lines where order_id = current_setting('t.o3')::uuid), 0::bigint, 'nor their lines');

-- ---------------------------------------------------------------- immutability, even as postgres
reset role;
select throws_ok($$update public.orders set total_cents = 1 where id = current_setting('t.o2')::uuid$$, 'P0001', 'order_is_immutable', 'confirmed order cannot be updated');
select throws_ok($$update public.order_lines set discount_cents = 0 where id = current_setting('t.l3')::uuid$$, 'P0001', 'order_is_immutable', 'confirmed line cannot be updated');
select throws_ok($$delete from public.order_lines where id = current_setting('t.l3')::uuid$$, 'P0001', 'orders_are_append_only', 'lines cannot be deleted');
select throws_ok($$delete from public.orders where id = current_setting('t.o1')::uuid$$, 'P0001', 'orders_are_append_only', 'orders cannot be deleted');
select lives_ok($$set constraints all immediate$$, 'all order totals equal the sum of their lines');

select * from finish();
rollback;
