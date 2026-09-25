# Notes on the trial: what I'd change for the real system, and open questions

*DRAFT, to be edited before sending.*

## What the trial proves

- **The worked example comes out exactly.**
  - Line percentages: 1.94% / 4.32% / 7.25%.
  - Bands: sand / red / blocked.
  - Totals: $3,570 = 29,274,000 SDG and $5,490 = 45,018,000 SDG.
  - Unit tests, database tests and a live verification script (`npm run verify`) all check these numbers.
- **The 5% block holds against direct API calls.** An adviser holding her own login token and the public key cannot insert, update or approve anything directly. The database has no write permissions for her at all. The only way in is `save_order`, which reads the price from the products table, recomputes every band from the settings, and turns any line above 5% into a request for approval.
- **A saved order never moves.** The rate, the thresholds, every unit price and every total are stored on the order, in integer cents and integer piastres. A database trigger refuses any change to a confirmed order, even from our own code. The order page reads only those stored values.
- **Splitting a line does not get around the limit.** If every line is at or below 5% of its own value, the whole order is too. So two half-lines at 5% each give the same money as one line at 5%.

## What I would do differently in the real system

1. **An append-only ledger instead of totals on rows.** Every money movement (order, receipt, transfer, exchanger payout, conversion) becomes a ledger entry with an origin account, a destination account, an amount, a currency and the rate of that day. Balances, "outstanding per exchanger" and "pass-through nets to zero" are then sums over the ledger. They are never stored numbers that could drift. Corrections are reversing entries, never edits. The immutability trigger in this trial is the seed of that idea.
2. **A rate table with history** instead of a single setting:
   - `exchange_rates(currency_pair, rate, valid_from, entered_by, source)`, with a minimum rate per day, per route (each exchanger, the UAE account) and per direction.
   - Every order, receipt and conversion stores a foreign key to the rate row it used **and** a copy of the rate itself.
   - Reports in euros then use the EUR rate stored on the actual conversion, never "today's rate". That is the only way a report run in six months gives the same number to the last pound.
   - Rates should become exact decimals (numerator and denominator, or scaled integers) once the EUR/USD and AED legs arrive, because those rates are not whole numbers.
3. **Multi-tenancy from day one.**
   - A `tenant_id` on every row, set from the user's JWT claims, never from the client.
   - Part of every RLS policy, every unique key (order numbers per tenant) and every index.
   - Shamsy is tenant #1, and each dealer later becomes a tenant. Turning on dealer access is then a switch, not a migration.
4. **Four roles, with column-level protection for cost prices.**
   - Roles: owner, sales adviser, marketing, warehouse.
   - Cost price and margin do not belong in the `products` table the adviser can read. They go in separate tables (`product_costs`, landed-cost lines) whose RLS allows only the owner.
   - Views or RPCs expose only what each role may see, so "an adviser cannot reach a cost price even by querying the database" holds by construction.
5. **An Nx monorepo**, as you asked:
   - `apps/web` (Next.js);
   - `libs/money`: this `money.ts`, shared by the web app, scripts, PDF quotes and imports;
   - `libs/db` (generated Supabase types and migrations);
   - `libs/i18n`.
   - GitHub Actions run affected tests and preview deploys per pull request.
6. **Fuller offline support.** The trial keeps the draft in `localStorage` and retries idempotently. The real app should add:
   - a service worker, so the app shell and catalogue load with no signal;
   - an outbox in IndexedDB, so several orders and receipts can be queued offline and sent in order when the signal returns;
   - the same `client_request_id` idempotency on every write, which is already the pattern here;
   - a visible sync-status indicator.
7. **Audit logs.**
   - Every settings change, approval, price override, login and export is recorded with who, when, before and after values, and the reason.
   - Settings become versioned rows, not updated in place, so you can always see which minimum rate or discount limit applied on a given day.
   - Rejecting a pending line, with a reason, is also missing today: the adviser can only resubmit.
8. **Generated types and stricter CI.**
   - Generate database types with `supabase gen types` so a renamed column breaks the build.
   - Run the pgTAP and `verify` suites on every pull request against a disposable database. The workflow for this is already in `.github/workflows/ci.yml`.
   - Add a staging project with a copy of production data for acceptance tests.
9. **Payment instructions as part of the order.** "Pay into account X in N transfers of 3,000,000" should be computed on the server from the stored SDG total, the 3,000,000 cap per transfer and each exchanger's remaining daily limit, then stored with the order. That way it is reproducible later, just like the totals.
10. **Password reset and session policy.** The trial has email and password sign-in only. The real system needs password reset, session length suited to shared phones, and a way for the owner to deactivate a user immediately.

## Unclear points in the rules, and what I assumed

1. **Does "rate setting" mean the minimum rate or a default daily rate?** The worked example says "change the rate setting to 9,000", but the rules speak of a minimum rate the owner raises as the pound falls. I built both:
   - `min_rate`: the hard floor, enforced by the database;
   - `default_rate`: the value prefilled on a new order.

   In the demo, both change to 9,000. Should the day's rate be set centrally by the owner (advisers only confirm it), or typed by each adviser per order as now?
2. **Are 3.00% and 5.00% inclusive?** I assumed yes: exactly 3.00% is sand and exactly 5.00% is red (still allowed), as in "up to 3%". Blocked starts at the first cent above 5.00%. The brief also says "red from 3% to 5%", which would read differently if exactly 3% were meant to be red.
3. **Should editing an approved line reset its approval?** In this trial a saved order, and a pending request, cannot be edited at all, so the question does not arise yet. In the real system I would make any change to quantity, price or discount on an approved line void the approval and require a new one.
4. **Can the rate have decimals?** I assumed whole SDG per USD, as in all your examples. If decimals are needed (e.g. 8,215.50), the rate would be stored as an integer in hundredths.
5. **SDG rounding if the rate ever has decimals.** With a whole-number rate, cents × rate is always an exact number of piastres: no rounding exists. With a decimal rate you must choose a rule: round half-up to the piastre or to the whole pound, and whether to round per line or once on the order total. Line-level and order-level rounding can differ by a pound, and your rule "not a single pound" needs that choice written down.
6. **Should a pending-approval order reserve anything?** Today it reserves nothing: no stock and no payment instructions. When stock arrives, should a request waiting for approval hold the goods, and for how long? Should requests expire?
7. **Can the owner edit or cancel a confirmed order?** I assumed no: orders are append-only. A correction would be a new record, such as a cancellation or credit note that references the original, so history and reports never move.
8. **Which rate applies when approval comes days later?** The request stores the rate typed when it was sent. If the owner approves three days later, and the pound has fallen or the minimum has risen since, the order is confirmed at the old rate. That follows "a saved order never changes", but it may not be what you want for the price in pounds. Options:
   - approval confirms the stored rate, which is the current behaviour;
   - approval requires re-entering the day's rate;
   - requests expire at the end of the day.
9. **What exactly does the owner approve?** I assumed approval is per line, for that exact discount amount. Should the owner also be able to approve with a lower discount, which would make it a counter-offer?
10. **Price override by the owner.** The brief says "only the owner can override a price". The trial does not build this. In the real system I would store the list price and the override price separately on the line, with who overrode it and why, and treat the override separately from the discount bands. Please confirm that the discount percentage should then be measured against the overridden price rather than the list price.
