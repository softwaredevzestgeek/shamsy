# Shamsy · Record an order (trial)

A sales adviser, on her phone and often on 3G, records a dealer's order: she picks the dealer, adds products at fixed USD prices, gives an optional discount per line, enters the day's USD→SDG rate, and saves.
Discounts above 5% need the owner's approval, and the database enforces that even against direct API calls.
Every saved order keeps the rate, prices and amounts it was saved with, as integers, and never changes afterwards.

**Stack:** Next.js 16 (App Router) + TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS) via `@supabase/ssr` · Vitest · pgTAP · Vercel.

---

## Contents

- [Setup](#setup)
- [Deploying to Vercel](#deploying-to-vercel)
- [Demo walkthrough (for the video)](#demo-walkthrough-for-the-video)
- [How it works](#how-it-works)
- [Design decisions](#design-decisions)
- [Tests](#tests)
- [Project layout](#project-layout)

---

## Setup

Requirements: Node 20.9+ (22 LTS recommended), npm, a Supabase account. The Supabase CLI ships as a dev dependency (`npx supabase …`).

1. **Install**
   ```bash
   npm install
   ```
2. **Create a Supabase project** at <https://supabase.com/dashboard>. Note the project ref (the `xxxx` in `https://xxxx.supabase.co`) and the database password.
3. **Link the repo to it**
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   ```
4. **Apply the migrations** (schema, RLS, triggers, functions)
   ```bash
   npx supabase db push
   ```
   *No IPv6 on your network?* The direct `db.<ref>.supabase.co` host is IPv6-only. Use the IPv4 session pooler instead (Dashboard → **Connect** → Session pooler), URL-encoding special characters in the password (`@` → `%40`):
   ```bash
   npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" --include-seed
   ```
5. **Load the seed data** (settings row, 4 products, 3 dealers). Pick one:
   - **CLI:** `npx supabase db push --include-seed`, which runs `supabase/seed.sql` after the migrations. The seed is idempotent, so running it again is safe.
   - **SQL editor:** open *Dashboard → SQL Editor*, paste the contents of `supabase/seed.sql`, and run it.
   - **psql:** `psql "<connection string from Dashboard → Connect>" -f supabase/seed.sql`
6. **Fill `.env.local`**
   ```bash
   cp .env.example .env.local
   ```
   From *Project Settings → API Keys*, copy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`, the current key type). On older projects, set the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. The app reads whichever is set, publishable first.
   - `SUPABASE_SERVICE_ROLE_KEY` (legacy `service_role` key) **or** `SUPABASE_SECRET_KEY` (`sb_secret_…`). Only `scripts/seed-users.ts` reads it. Nothing in `src/` does.
   - `SEED_ADVISER_PASSWORD`, `SEED_OWNER_PASSWORD`: choose any passwords of 8 or more characters.
7. **Create the two users**
   ```bash
   npm run seed:users
   ```
   This creates `adviser@shamsy.test` (role `adviser`) and `owner@shamsy.test` (role `owner`), both already confirmed. The script is idempotent: running it again resets their passwords and roles.
8. **Verify against the real database** (optional but recommended)
   ```bash
   npm run verify
   ```
9. **Run the app**
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000> and sign in.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates route types, then runs `tsc --noEmit` |
| `npm test` | Vitest unit tests (money maths, worked example, form evaluation) |
| `npm run seed:users` | Creates or updates the adviser and owner users (service key) |
| `npm run verify` | 14 end-to-end PASS/FAIL checks against Supabase, using the public key only |
| `npm run test:db` | pgTAP tests in `supabase/tests/` (needs `npx supabase start`, which needs Docker) |

---

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel. The framework preset is Next.js and no build settings need changing.
2. Set these **Environment Variables** for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

   Do **not** add the service or secret key or the seed passwords. The app does not need them.
3. Deploy.
4. In Supabase, go to *Authentication → URL Configuration* and set **Site URL** to the Vercel URL. Sign-in is by password, so no redirect URLs are needed.

---

## Demo walkthrough (for the video)

This follows the client's worked example. Record at phone width (375 px, e.g. Chrome DevTools → device mode → iPhone), or at desktop width to show the sticky summary panel.

**As the adviser** (`adviser@shamsy.test`):

1. **New order** (tab in the header, or the round **+** button on phones).
2. **Step 1 · Dealer:** tap **Ahmed Trading — Khartoum**. The card turns green with a check.
3. **Step 2 · Products:** tap the **SPF 6000 ES Plus** tile. A line appears with quantity 1.
   Tap **+** three times → quantity **4**. Type **40** in *Discount (USD)*.
   Shown: line value **$2,060**, **1.94%**, band **● Sand**, line total **$2,020**.
4. Tap the **Hope 5.0L-B1** tile, quantity **2**, discount **70** → **$1,620**, **4.32%**, **▲ Red**, **$1,550**.
5. Tap the **Hope 16.0LM-A1** tile, quantity **1**, discount **150** → **$2,070**, **7.25%**, **⛔ Blocked** (striped card + label, not colour alone), **$1,920**.
6. **Step 3 · Exchange rate:** type **7900** and tap outside → refused, reset to **8,000**, message *"Minimum rate is 8,000 SDG per USD"*.
7. Type **8200** → *Dealer pays* **45,018,000 SDG**, **$5,490**.
8. **Save order** is disabled; the red **Send for owner approval** button is shown, with the reason.
9. *(Weak connection, optional)* DevTools → Network → **Offline**, reload: the draft comes back ("Your unsaved order was restored"). Back to Online.
10. Remove line 3 (**×**) → **$3,570 = 29,274,000 SDG**, no blocked line, **Save order** enabled. (Optionally save this as its own order.)
11. Add the Hope 16.0LM-A1 line again (discount 150) and tap **Send for owner approval** → the order opens as **Waiting for owner approval**, not confirmed.

**As the owner** (`owner@shamsy.test`):

12. **Approvals** (the badge shows 1): the Hope 16.0LM-A1 line with dealer, adviser, **$150**, **⛔ 7.25%**. Tap **Approve** — the card disappears immediately.
13. Open the order (**Orders** → filter **Confirmed**): **Confirmed**, **8,200 SDG per USD**, **$5,490**, **45,018,000 SDG**; line 3 shows *Approved by Demo Owner on …*.
14. **Settings:** minimum rate and default rate → **9,000**, save.
15. Reopen the order: still **8,200** and **45,018,000 SDG** — the page reads only stored values.
16. *(Optional)* **New order** now defaults to 9,000 and refuses 8,200.
17. Settings back to **8,000 / 8,000**.
18. *(Optional)* As the owner, enter the 3-line order yourself: the button reads **Save and approve 1 blocked line(s)** and the order is confirmed at once, with the owner recorded as approver.
19. *(Optional)* On the order page, **Share on WhatsApp** prefills the summary for the dealer.

To prove the rules server-side on camera, run `npm run verify` in a terminal (14 PASS/FAIL checks).

---

## How it works

```
Browser (phone)                      Supabase
─────────────────                    ──────────────────────────────────────────
OrderForm (client)                   PostgREST ── RLS: SELECT only, own rows
  money.ts: live bands & totals        │
  draft in localStorage                └─ rpc/save_order  (SECURITY DEFINER)
  client_request_id per draft               - price from products, never client
        │                                   - thresholds & min rate from settings
        └── supabase.rpc('save_order',      - bands, totals, piastres computed here
              {customer, rate,              - pending_approval if adviser + blocked
               [{product_id, qty,           - idempotent on client_request_id
                 discount_cents}],        triggers: append-only, totals = Σ lines
               client_request_id})
```

- **`src/lib/money.ts`** holds all the money logic as pure functions: string → cents parsing, band classification by cross-multiplication, exact SDG piastres with `bigint`, and `Intl` formatting that never divides a float.
- **`supabase/migrations/*_order_functions.sql`** mirrors the same rules in SQL (`discount_band`, `discount_bp_display`, `save_order`). Both sides are tested against the same numbers.
- The browser computes only for display. The database recomputes everything and is the source of truth.

---

## Design decisions

**Integer money.** USD is stored as `bigint` cents. JavaScript never multiplies a float by 100: user input like `"40.50"` is parsed as a string, digits only, and more than two decimals are rejected. Totals that can exceed 2^53 use `bigint`.

**SDG piastres, no rounding.** `total_sdg_piastres = total_cents × rate`. One cent at 8,200 SDG/USD is 82.00 SDG, exactly 8,200 piastres, because 1 USD = 100 cents and 1 SDG = 100 piastres. With an integer rate, the SDG amount is always an exact integer and there is nothing to round. A check constraint (`total_sdg_piastres = total_cents * rate`) makes the database refuse any row where that is not true. Pages read the piastres as text (`::text`), so a big number never passes through a lossy JS `number`.

**Rate and rules are snapshots.** Each order stores its `rate` and the `discount_sand_max_bp` / `discount_red_max_bp` thresholds in force when it was saved. Each line stores the product name, SKU, unit price, line value, discount, line total, percentage and band. The order page renders only these stored columns and never joins to `products` or `settings`, so changing settings or prices cannot move a saved order.

**Bands by cross-multiplication.** A line is sand if `d·10000 ≤ v·300`, red if `≤ v·500`, and blocked above that. This is exact, both boundaries are inclusive, and it involves no division. The displayed percentage (1.94%) is rounded half-up to whole basis points and stored as `discount_bp_display` (an integer: 194). It is display-only and never used for decisions. I stored an integer rather than the suggested `numeric(6,2)` to keep one rule for the whole codebase: no decimal types for amounts or ratios.

**Writes only through `SECURITY DEFINER` RPCs.** The `authenticated` role has only `SELECT` privileges, and RLS has only `SELECT` policies. There are no insert, update or delete policies on any table. `save_order`, `approve_order_line` and `update_settings` are the only write paths. They run with `search_path = ''`, use fully-qualified names, and are executable by `authenticated` only (revoked from `public` and `anon`). `save_order` reads `price_cents` from `products` and ignores any price in the payload.

**Immutability trigger (second line of defence).** Even the definer functions, or a developer with the service key, cannot:
- delete or truncate orders or lines;
- update a confirmed order or its lines;
- change any money, rate or snapshot column on any order;
- add a line to a confirmed order;
- confirm an order that still has pending lines.

A deferred constraint trigger also checks, at commit, that every new order's subtotal and discount equal the sum of its lines. Check constraints tie the numbers together (`line_value = unit_price × qty`, `line_total = value − discount`, `discount ≤ value`, `total = subtotal − discount`, and `band = 'blocked'` ⇔ approval required).

**Pending-approval flow.** When an adviser saves an order with a blocked line, the result is a request, not a sale. The order is stored with `status = pending_approval` and those lines `pending`, with all amounts already frozen. The owner approves each line in **Approvals**. Approval changes only `approval_status`, the approver and the time, never an amount. When the last pending line is approved, the order becomes `confirmed`. When the owner enters a blocked line himself, saving is his approval: the line is stored `approved` with his id and the order is confirmed at once.

**Idempotency for 3G.** Each draft gets a `client_request_id` (UUID) that is stored with the draft in `localStorage`. If the connection drops after the server committed but before the phone got the answer, tapping Save again sends the same id and gets the same order back instead of creating a duplicate. The server also stores an md5 fingerprint of the payload. If the draft was edited after an attempt that actually went through, the same id with different content is refused, and the UI links to the order that was saved.

**Weak connection handling.**
- The draft is saved on every keystroke and restored after a reload or crash. It is cleared only after a confirmed save.
- Saves time out after 30 seconds with a clear message.
- An offline banner uses `navigator.onLine`.
- There are no web fonts and no UI or icon libraries (icons are inline SVG).
- Every route has a `loading.tsx` skeleton, so navigation is instant and prefetchable; visited pages stay in the client router cache for 30 s (`staleTimes`), and every write calls `router.refresh()`.
- The main screen needs one RPC to save.

**Accessible bands.** Colour is never the only signal. Every band has a text label and an icon (● sand, ▲ red, ⛔ blocked), and the blocked band is also striped.

**i18n-ready.**
- Every UI string is in `src/i18n/en.json`, accessed with a typed `t("key", {vars})`. A missing key is a type error.
- Layout uses logical utilities (`ms-`/`me-`, `ps-`/`pe-`, `start-`, `text-end`), and `<html dir>` comes from the locale.
- Numbers and dates go through `Intl` in the Africa/Khartoum time zone.
- Arabic becomes an `ar.json` plus a locale switch.

**Sessions.** `src/proxy.ts` (Next 16's name for middleware) refreshes the Supabase session cookie on each request and redirects signed-out users to `/login`. That redirect is UX only. The data is protected by RLS and the RPCs.

**Order numbers.** An identity column starting at 1001. Gaps can appear after a failed transaction, which is normal for Postgres sequences. The real system may want gapless document numbers per tenant and year.

---

## Tests

| Layer | Where | Runs |
|---|---|---|
| Unit | `src/lib/money.test.ts`, `src/lib/order-form.test.ts` | `npm test` |
| Database | `supabase/tests/database/orders.test.sql` (pgTAP, ~50 assertions, all in a rolled-back transaction) | `npm run test:db` on a local Supabase |
| End-to-end | `scripts/verify.ts`: 14 checks, public key + user logins only | `npm run verify` against any Supabase project |
| CI | `.github/workflows/ci.yml` runs lint, typecheck, unit tests and build, then starts Supabase in CI and runs pgTAP, `seed:users` and `verify` | on push / PR |

Unit tests cover:
- dollar parsing (`"40"`, `"40.5"`, `"40.50"`; rejects `"40.505"`, `"abc"`, negatives);
- band boundaries (0%, exactly 3.00%, 3.00%+1¢, exactly 5.00%, 5.00%+1¢);
- the rate rule (7,900 → 8,000);
- **the client's worked example to the cent**: 1.94% / 4.32% / 7.25%, sand / red / blocked, $3,570 = 29,274,000 SDG, and $5,490 = 45,018,000 SDG;
- `bigint` exactness beyond 2^53.

`verify.ts` covers:

1. Lines 1 and 2 → confirmed, 357000 ¢, 2927400000 piastres.
2. 3 lines → `pending_approval`.
3. Adviser cannot approve.
4. Direct `insert` into `orders` / `order_lines` is refused.
5. Direct `update` / `delete` is refused.
6. Rate 7,900 is refused.
7. A forged price is ignored.
8. Owner approval → 549000 ¢, 4501800000 piastres, rate 8,200.
9. Settings at 9,000 do not move the order. Settings are then restored.
10. The same `client_request_id` sent twice, including concurrently → one order.
11. The adviser cannot read the owner's orders.
12. The adviser cannot change settings or her own role.
13. Discounts above the line value, fractional quantities and negative discounts are refused.
14. The anon key alone can read or write nothing.

---

## Project layout

```
src/
  lib/money.ts              all money maths (pure, integer-only)
  lib/order-form.ts         typed draft -> integer lines, bands, totals (pure)
  lib/draft.ts              localStorage draft + client_request_id
  lib/errors.ts             DB error code -> translated message; network detection
  lib/supabase/             browser, server and proxy clients (@supabase/ssr)
  i18n/en.json, index.ts    all UI strings, t(), Intl helpers
  components/order/         OrderForm, LineEditor (the main screen)
  app/login                 sign in
  app/(app)/orders          list, new, [id] read-only view
  app/(app)/approvals       owner only
  app/(app)/settings        owner only
  proxy.ts                  session refresh + redirect to /login
supabase/
  migrations/               schema, security (RLS/grants), immutability, RPCs
  seed.sql                  settings, products, dealers
  tests/database/           pgTAP
scripts/
  seed-users.ts             npm run seed:users
  verify.ts                 npm run verify
NOTES.md                    notes for the client (draft)
```
