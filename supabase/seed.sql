-- Seed data for the Shamsy order trial. Safe to run more than once.
-- Users are created by `npm run seed:users` (scripts/seed-users.ts), not here.

insert into public.settings (id, min_rate, default_rate, discount_sand_max_bp, discount_red_max_bp)
values (true, 8000, 8000, 300, 500)
on conflict (id) do nothing;

insert into public.products (sku, name, price_cents) values
  ('SPF-6000-ES-PLUS', 'SPF 6000 ES Plus — 6 kW inverter',  51500),
  ('SPE-12000-ES',     'SPE 12000 ES — 12 kW inverter',     97500),
  ('HOPE-5.0L-B1',     'Hope 5.0L-B1 — 5 kWh battery',      81000),
  ('HOPE-16.0LM-A1',   'Hope 16.0LM-A1 — 16 kWh battery',  207000)
on conflict (sku) do nothing;

insert into public.customers (id, name, city) values
  ('c0000000-0000-4000-8000-000000000001', 'Ahmed Trading', 'Khartoum'),
  ('c0000000-0000-4000-8000-000000000002', 'Nile Solar',    'Omdurman'),
  ('c0000000-0000-4000-8000-000000000003', 'Dongola Power', 'Dongola')
on conflict (id) do nothing;
