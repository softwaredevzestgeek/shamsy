/**
 * End-to-end verification against a real Supabase project.
 *
 *   npm run verify
 *
 * Uses ONLY the public (anon / publishable) key and the two users' own logins,
 * exactly like an adviser calling PostgREST directly with her JWT would.
 * Prints PASS / FAIL per check and exits non-zero if anything failed.
 *
 * It creates real orders (orders are append-only by design, so they stay).
 * It changes settings in check 9 and always restores 8,000 / 8,000.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_KEY, SUPABASE_URL, USERS, need } from "./env";

type Line = { product_id: string; quantity: number; discount_cents: number; [k: string]: unknown };

const url = SUPABASE_URL();
const key = PUBLIC_KEY();
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function newClient(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}. Did you run npm run seed:users?`);
  return client;
}

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${tag}  ${name}${detail ? `\n        ${detail}` : ""}`);
}

async function check(name: string, fn: () => Promise<string | true>) {
  try {
    const outcome = await fn();
    if (outcome === true) record(name, true);
    else record(name, false, outcome);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

function expectEqual(label: string, actual: unknown, expected: unknown): string | null {
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? null
    : `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

function firstFailure(...failures: Array<string | null>): string | true {
  const f = failures.filter(Boolean);
  return f.length ? f.join("; ") : true;
}

async function readOrder(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("orders")
    .select("id, status, confirmed_at, rate, subtotal_cents, discount_cents, total_cents, total_sdg_piastres::text, client_request_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`read order: ${error.message}`);
  return data as null | {
    id: string; status: string; confirmed_at: string | null; rate: number; subtotal_cents: number;
    discount_cents: number; total_cents: number; total_sdg_piastres: string; client_request_id: string;
  };
}

async function readLines(client: SupabaseClient, orderId: string) {
  const { data, error } = await client
    .from("order_lines")
    .select("id, line_no, unit_price_cents, quantity, line_value_cents, discount_cents, line_total_cents, discount_bp_display, band, approval_status, approved_by")
    .eq("order_id", orderId)
    .order("line_no");
  if (error) throw new Error(`read lines: ${error.message}`);
  return data as Array<{
    id: string; line_no: number; unit_price_cents: number; quantity: number; line_value_cents: number;
    discount_cents: number; line_total_cents: number; discount_bp_display: number; band: string;
    approval_status: string; approved_by: string | null;
  }>;
}

async function main() {
  console.log(`Verifying against ${url}\n`);
  const adviser = await signIn(USERS.adviser.email, need(USERS.adviser.passwordVar));
  const owner = await signIn(USERS.owner.email, need(USERS.owner.passwordVar));
  const anon = newClient();

  // Reference data ------------------------------------------------------------
  const { data: products, error: pErr } = await adviser.from("products").select("id, sku, price_cents");
  if (pErr || !products) throw new Error(`Cannot read products: ${pErr?.message}. Did you run supabase/seed.sql?`);
  const sku = (s: string) => {
    const p = products.find((x) => x.sku === s);
    if (!p) throw new Error(`Product ${s} missing. Run supabase/seed.sql.`);
    return p.id as string;
  };
  const SPF = sku("SPF-6000-ES-PLUS");
  const H5 = sku("HOPE-5.0L-B1");
  const H16 = sku("HOPE-16.0LM-A1");
  const { data: customer } = await adviser.from("customers").select("id").eq("name", "Ahmed Trading").maybeSingle();
  if (!customer) throw new Error("Customer Ahmed Trading missing. Run supabase/seed.sql.");
  const CUSTOMER = customer.id as string;

  // Make sure we start from the documented settings.
  const reset = await owner.rpc("update_settings", { p_min_rate: 8000, p_default_rate: 8000 });
  if (reset.error) throw new Error(`Owner cannot reset settings: ${reset.error.message}`);

  const line1: Line = { product_id: SPF, quantity: 4, discount_cents: 4000 };
  const line2: Line = { product_id: H5, quantity: 2, discount_cents: 7000 };
  const line3: Line = { product_id: H16, quantity: 1, discount_cents: 15000 };
  const save = (client: SupabaseClient, rate: number, lines: Line[], requestId: string = randomUUID()) =>
    client.rpc("save_order", { p_customer_id: CUSTOMER, p_rate: rate, p_lines: lines, p_client_request_id: requestId });

  let order1Id = "";
  let order2Id = "";
  let line3Id = "";
  const order1RequestId = randomUUID();

  // 1 ---------------------------------------------------------------------------
  await check("1. Adviser saves lines 1+2 at 8,200 -> confirmed, 357000 cents, 2927400000 piastres (29,274,000 SDG)", async () => {
    const { data, error } = await save(adviser, 8200, [line1, line2], order1RequestId);
    if (error) return `save_order failed: ${error.message}`;
    order1Id = data as string;
    const o = await readOrder(adviser, order1Id);
    const lines = await readLines(adviser, order1Id);
    return firstFailure(
      expectEqual("status", o?.status, "confirmed"),
      expectEqual("rate", o?.rate, 8200),
      expectEqual("total_cents", o?.total_cents, 357000),
      expectEqual("total_sdg_piastres", o?.total_sdg_piastres, "2927400000"),
      expectEqual("bands", lines.map((l) => l.band), ["sand", "red"]),
      expectEqual("percent (bp)", lines.map((l) => l.discount_bp_display), [194, 432]),
      expectEqual("line totals", lines.map((l) => l.line_total_cents), [202000, 155000]),
    );
  });

  // 2 ---------------------------------------------------------------------------
  await check("2. Adviser submits all 3 lines -> pending_approval, not confirmed", async () => {
    const { data, error } = await save(adviser, 8200, [line1, line2, line3]);
    if (error) return `save_order failed: ${error.message}`;
    order2Id = data as string;
    const o = await readOrder(adviser, order2Id);
    const lines = await readLines(adviser, order2Id);
    line3Id = lines.find((l) => l.line_no === 3)?.id ?? "";
    return firstFailure(
      expectEqual("status", o?.status, "pending_approval"),
      expectEqual("confirmed_at", o?.confirmed_at, null),
      expectEqual("bands", lines.map((l) => l.band), ["sand", "red", "blocked"]),
      expectEqual("approval", lines.map((l) => l.approval_status), ["not_required", "not_required", "pending"]),
      expectEqual("percent line 3 (bp)", lines[2]?.discount_bp_display, 725),
    );
  });

  // 3 ---------------------------------------------------------------------------
  await check("3. Adviser calls approve_order_line herself -> rejected", async () => {
    const { error } = await adviser.rpc("approve_order_line", { p_line_id: line3Id });
    const lines = await readLines(adviser, order2Id);
    return firstFailure(
      error ? null : "approve_order_line did not return an error",
      expectEqual("line 3 approval", lines[2]?.approval_status, "pending"),
      expectEqual("order status", (await readOrder(adviser, order2Id))?.status, "pending_approval"),
    );
  });

  // 4 ---------------------------------------------------------------------------
  await check("4. Adviser inserts directly into orders and order_lines via PostgREST -> rejected", async () => {
    const { data: me } = await adviser.auth.getUser();
    const forgedRequest = randomUUID();
    const insOrder = await adviser.from("orders").insert({
      customer_id: CUSTOMER, created_by: me.user?.id, status: "confirmed", confirmed_at: new Date().toISOString(),
      rate: 8200, discount_sand_max_bp: 300, discount_red_max_bp: 500,
      subtotal_cents: 207000, discount_cents: 15000, total_cents: 192000, total_sdg_piastres: 1574400000,
      client_request_id: forgedRequest, request_fingerprint: "forged",
    });
    const insLine = await adviser.from("order_lines").insert({
      order_id: order2Id, line_no: 99, product_id: H16, product_sku: "X", product_name: "X",
      unit_price_cents: 207000, quantity: 1, line_value_cents: 207000, discount_cents: 15000,
      line_total_cents: 192000, discount_bp_display: 725, band: "blocked", approval_status: "approved",
      approved_by: me.user?.id, approved_at: new Date().toISOString(),
    });
    const { count } = await adviser.from("orders").select("id", { count: "exact", head: true }).eq("client_request_id", forgedRequest);
    const lines = await readLines(adviser, order2Id);
    return firstFailure(
      insOrder.error ? null : "insert into orders succeeded",
      insLine.error ? null : "insert into order_lines succeeded",
      expectEqual("forged orders stored", count, 0),
      expectEqual("lines on order 2", lines.length, 3),
    );
  });

  // 5 ---------------------------------------------------------------------------
  await check("5. Adviser updates a line's discount / approval, or deletes, directly -> rejected", async () => {
    const upd1 = await adviser.from("order_lines").update({ discount_cents: 0 }).eq("id", line3Id).select();
    const upd2 = await adviser
      .from("order_lines")
      .update({ approval_status: "approved", approved_by: (await adviser.auth.getUser()).data.user?.id, approved_at: new Date().toISOString() })
      .eq("id", line3Id)
      .select();
    const upd3 = await adviser.from("orders").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", order2Id).select();
    const del = await adviser.from("orders").delete().eq("id", order1Id).select();
    const changed = (r: { error: unknown; data: unknown[] | null }) => !r.error && (r.data?.length ?? 0) > 0;
    const lines = await readLines(adviser, order2Id);
    return firstFailure(
      changed(upd1) ? "discount update changed a row" : null,
      changed(upd2) ? "approval update changed a row" : null,
      changed(upd3) ? "order status update changed a row" : null,
      changed(del) ? "delete removed a row" : null,
      expectEqual("line 3 discount", lines[2]?.discount_cents, 15000),
      expectEqual("line 3 approval", lines[2]?.approval_status, "pending"),
      (await readOrder(adviser, order1Id)) ? null : "order 1 is gone",
    );
  });

  // 6 ---------------------------------------------------------------------------
  await check("6. Adviser calls save_order with rate 7,900 -> rejected", async () => {
    const { data, error } = await save(adviser, 7900, [line1]);
    return firstFailure(
      error ? null : `accepted, created order ${data}`,
      error && !/rate_below_minimum/.test(error.message) ? `unexpected error: ${error.message}` : null,
    );
  });

  // 7 ---------------------------------------------------------------------------
  await check("7. Manipulated price in the payload -> ignored, stored price comes from products", async () => {
    const forged: Line = { product_id: SPF, quantity: 4, discount_cents: 0, unit_price_cents: 1, price_cents: 1, line_value_cents: 4, line_total_cents: 4 };
    const { data, error } = await save(adviser, 8200, [forged]);
    if (error) return `save_order failed: ${error.message}`;
    const lines = await readLines(adviser, data as string);
    const o = await readOrder(adviser, data as string);
    return firstFailure(
      expectEqual("unit_price_cents", lines[0]?.unit_price_cents, 51500),
      expectEqual("line_value_cents", lines[0]?.line_value_cents, 206000),
      expectEqual("total_cents", o?.total_cents, 206000),
    );
  });

  // 8 ---------------------------------------------------------------------------
  await check("8. Owner approves line 3 -> confirmed, 549000 cents, 4501800000 piastres (45,018,000 SDG), rate 8,200", async () => {
    const { data, error } = await owner.rpc("approve_order_line", { p_line_id: line3Id });
    if (error) return `approve_order_line failed: ${error.message}`;
    const o = await readOrder(adviser, order2Id); // read back as the adviser, through RLS
    const lines = await readLines(adviser, order2Id);
    const { data: ownerUser } = await owner.auth.getUser();
    return firstFailure(
      expectEqual("rpc order_status", (data as { order_status?: string })?.order_status, "confirmed"),
      expectEqual("status", o?.status, "confirmed"),
      o?.confirmed_at ? null : "confirmed_at not set",
      expectEqual("rate", o?.rate, 8200),
      expectEqual("total_cents", o?.total_cents, 549000),
      expectEqual("total_sdg_piastres", o?.total_sdg_piastres, "4501800000"),
      expectEqual("line 3 approval", lines[2]?.approval_status, "approved"),
      expectEqual("approved_by", lines[2]?.approved_by, ownerUser.user?.id),
    );
  });

  // 9 ---------------------------------------------------------------------------
  await check("9. Owner sets default_rate and min_rate to 9,000 -> order still shows 8,200 and 45,018,000 SDG; restored to 8,000", async () => {
    try {
      const { error } = await owner.rpc("update_settings", { p_min_rate: 9000, p_default_rate: 9000 });
      if (error) return `update_settings failed: ${error.message}`;
      const o = await readOrder(adviser, order2Id);
      const o1 = await readOrder(adviser, order1Id);
      const newOrderAt8200 = await save(adviser, 8200, [line1]);
      return firstFailure(
        expectEqual("order 2 rate", o?.rate, 8200),
        expectEqual("order 2 total_cents", o?.total_cents, 549000),
        expectEqual("order 2 total_sdg_piastres", o?.total_sdg_piastres, "4501800000"),
        expectEqual("order 1 total_sdg_piastres", o1?.total_sdg_piastres, "2927400000"),
        newOrderAt8200.error ? null : "a new order at 8,200 was accepted while the minimum is 9,000",
      );
    } finally {
      const { error } = await owner.rpc("update_settings", { p_min_rate: 8000, p_default_rate: 8000 });
      if (error) console.error(`!! could not restore settings: ${error.message}`);
    }
  });

  // 10 --------------------------------------------------------------------------
  await check("10. Same client_request_id sent twice -> only one order", async () => {
    const requestId = randomUUID();
    const [a, b] = await Promise.all([save(adviser, 8200, [line1, line2], requestId), save(adviser, 8200, [line1, line2], requestId)]);
    const c = await save(adviser, 8200, [line1, line2], requestId);
    const { count } = await adviser.from("orders").select("id", { count: "exact", head: true }).eq("client_request_id", requestId);
    const replayOfCheck1 = await save(adviser, 8200, [line1, line2], order1RequestId);
    return firstFailure(
      a.error ? `first call failed: ${a.error.message}` : null,
      b.error ? `second (concurrent) call failed: ${b.error.message}` : null,
      c.error ? `third call failed: ${c.error.message}` : null,
      expectEqual("same id", new Set([a.data, b.data, c.data]).size, 1),
      expectEqual("orders with that id", count, 1),
      expectEqual("replay of check 1", replayOfCheck1.data, order1Id),
    );
  });

  // Extra hardening checks ---------------------------------------------------------
  await check("11. Adviser cannot read an order created by the owner", async () => {
    const { data, error } = await save(owner, 8200, [line1, line2, line3]);
    if (error) return `owner save failed: ${error.message}`;
    const asOwner = await readOrder(owner, data as string);
    const asAdviser = await readOrder(adviser, data as string);
    const linesAsAdviser = await readLines(adviser, data as string);
    return firstFailure(
      expectEqual("owner order status (blocked line approved on save)", asOwner?.status, "confirmed"),
      expectEqual("adviser sees order", asAdviser, null),
      expectEqual("adviser sees lines", linesAsAdviser.length, 0),
    );
  });

  await check("12. Adviser cannot change settings or her own role", async () => {
    const rpc = await adviser.rpc("update_settings", { p_min_rate: 1, p_default_rate: 1 });
    const direct = await adviser.from("settings").update({ min_rate: 1 }).eq("id", true).select();
    const { data: me } = await adviser.auth.getUser();
    const role = await adviser.from("profiles").update({ role: "owner" }).eq("id", me.user?.id ?? "").select();
    const { data: settings } = await adviser.from("settings").select("min_rate").single();
    const { data: profile } = await adviser.from("profiles").select("role").eq("id", me.user?.id ?? "").single();
    return firstFailure(
      rpc.error ? null : "update_settings accepted",
      !direct.error && (direct.data?.length ?? 0) > 0 ? "direct settings update changed a row" : null,
      !role.error && (role.data?.length ?? 0) > 0 ? "role update changed a row" : null,
      expectEqual("min_rate", settings?.min_rate, 8000),
      expectEqual("role", profile?.role, "adviser"),
    );
  });

  await check("13. Discount above the line value, or a fractional quantity, is rejected", async () => {
    const tooBig = await save(adviser, 8200, [{ product_id: SPF, quantity: 1, discount_cents: 51501 }]);
    const fractional = await save(adviser, 8200, [{ product_id: SPF, quantity: 1.5, discount_cents: 0 }]);
    const negative = await save(adviser, 8200, [{ product_id: SPF, quantity: 1, discount_cents: -100 }]);
    return firstFailure(
      tooBig.error ? null : "discount above line value accepted",
      fractional.error ? null : "fractional quantity accepted",
      negative.error ? null : "negative discount accepted",
    );
  });

  await check("14. Signed-out (anon key only) cannot read or write anything", async () => {
    const orders = await anon.from("orders").select("id").limit(1);
    const prods = await anon.from("products").select("id").limit(1);
    const rpc = await anon.rpc("save_order", { p_customer_id: CUSTOMER, p_rate: 8200, p_lines: [line1], p_client_request_id: randomUUID() });
    return firstFailure(
      orders.error || (orders.data?.length ?? 0) === 0 ? null : "anon can read orders",
      prods.error || (prods.data?.length ?? 0) === 0 ? null : "anon can read products",
      rpc.error ? null : "anon can call save_order",
    );
  });

  // Summary -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (order2Id) console.log(`Worked-example order (all 3 lines): ${order2Id}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n\x1b[31mABORTED\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
