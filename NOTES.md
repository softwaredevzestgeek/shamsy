# Shamsy trial: note

**Live:** https://shamsy.vercel.app · **Code:** https://github.com/softwaredevzestgeek/shamsy

## What I built and how it is proven

- **The worked example comes out exactly.**
  - Line discounts: 1.94% / 4.32% / 7.25%.
  - Bands: sand / red / blocked.
  - Without line 3: $3,570 = 29,274,000 SDG.
  - With line 3 approved: $5,490 = 45,018,000 SDG.

  The numbers are checked three ways: unit tests, tests inside the database, and a script (`npm run verify`) that runs 14 checks against the live project.
- **The 5% block cannot be bypassed.** An adviser has read-only access to the database. The only way to write is a server function that:
  - takes the price from the product table;
  - recomputes every discount band from the settings;
  - turns any line above 5% into a request for the owner.

  The verify script logs in as the adviser and tries each attack directly against the API: inserting orders, approving her own line, editing a discount, sending a fake price, using a rate of 7,900. All of them are refused.
- **A saved order never moves.** The order stores:
  - the rate;
  - the discount limits;
  - every unit price;
  - every total, in whole cents and whole piastres (1/100 pound).

  A database trigger refuses any change to a confirmed order, even from our own code. With the minimum rate raised to 9,000, the order still shows 8,200 and 45,018,000 SDG.
- **No rounding exists.** Cents × a whole-number rate is always an exact number of piastres. No floating-point numbers are used for money anywhere.
- **Built for a phone on 3G.**
  - The order being entered is kept on the phone, so a dropped connection or a reload loses nothing.
  - Pressing Save twice, or again after a timeout, can never create two orders.
  - All text lives in one translation file, and the layout can be mirrored, so Arabic is translation work only.

## What I would do differently in the real system

1. **A ledger instead of stored balances.**
   - Every money movement (payment, transfer, exchanger payout, conversion) becomes one line with a from-account, a to-account, an amount, a currency and the rate of that day.
   - Balances, "outstanding per exchanger" and "pass-through accounts net to zero" are then calculated from the ledger, so they cannot drift.
   - Mistakes are corrected with a reversing entry, never by editing.
2. **A rate table with history** instead of one setting.
   - Each order, receipt and conversion points to the exact rate it used, and also keeps a copy of it.
   - Euro reports use the rate of the actual conversion, never today's rate. That is what makes a report run in six months match to the pound.
3. **Multi-tenant from day one.** A `tenant_id` on every row, set by the server and enforced in every permission rule. Opening the system to dealers is then a switch, not a rewrite.
4. **Cost prices out of reach.**
   - Cost price and margin go in separate tables that only the owner can read, so an adviser can never query them.
   - The marketing and warehouse roles each get the same kind of database-level rules.
5. **Offline outbox.** Several orders or receipts can be queued with no signal and sent in order when the connection returns, each with the same no-duplicate protection as this trial.
6. **Audit trail and versioned settings.** Every approval, price override and settings change is recorded with who, when, and the before and after values. You can always see which minimum rate or discount limit applied on a given day.
7. **An Nx monorepo with the money logic as a shared library** used by the app, PDF quotes and imports. Every pull request runs the tests against a fresh copy of the database.

## Points in your rules that seem unclear

1. **"Rate setting": minimum or daily rate?** The example changes "the rate setting" to 9,000. The rules speak of a minimum the owner raises as the pound falls. I built both: a hard minimum and a default that is prefilled on new orders. Should the owner set the day's rate centrally, or should each adviser type it?
2. **Are exactly 3% and 5% inclusive?** I treated them as inclusive: 3.00% is sand, 5.00% is red and still allowed. The brief also says "red from 3% to 5%", which reads differently at exactly 3%.
3. **A rate that is days old at approval.** A request stores the rate from the moment it was sent. If you approve three days later, after the pound has fallen, the order is confirmed at the old rate. Should approval require today's rate, or should requests expire at the end of the day?
4. **Editing after approval.** Today a saved order or request cannot be edited at all. If editing is added, I would make any change to quantity, price or discount cancel the approval.
5. **Decimal rates.** I assumed whole pounds per dollar, as in all your examples. If rates like 8,215.50 appear, a rounding rule must be written down: to the piastre or the pound, and per line or per order. The two can differ by a pound, which your "not a single pound" rule does not allow.
6. **Cancelling a confirmed order.** I assumed it is never edited or deleted; a correction is a new record that points to the original. Is that how you want cancellations and credit notes handled?
7. **Does a pending request reserve stock?** Today it reserves nothing. Once stock is added, should a request waiting for approval hold the goods, and for how long?
8. **Owner price override.** When the owner overrides a price, should the discount bands be measured against the new price or the list price?

One more observation: splitting a line cannot get around the 5% limit. If every line stays at or below 5% of its own value, the whole order does too.
