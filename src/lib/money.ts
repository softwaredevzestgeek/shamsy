/**
 * All money logic for orders, in one pure module.
 *
 * Rules:
 * - USD amounts are integer cents (JS `number`, always checked to be a safe integer).
 * - The exchange rate is an integer number of SDG per 1 USD.
 * - SDG amounts are integer piastres (1/100 SDG) and are computed with `bigint`:
 *   total_sdg_piastres = total_usd_cents * rate  (exact, no rounding at all).
 * - Discount bands are classified with integer cross-multiplication, never division.
 * - No floating-point arithmetic is used on money anywhere in this file.
 *
 * The same rules are mirrored in SQL (supabase/migrations/*_order_functions.sql).
 * The database is the source of truth; this module drives the live UI and the tests.
 */

export type Band = "none" | "sand" | "red" | "blocked";

/** Discount thresholds in basis points (1% = 100 bp), read from the `settings` table. */
export interface DiscountThresholds {
  sandMaxBp: number;
  redMaxBp: number;
}

export const BP_PER_WHOLE = 10_000;

/** Upper bound for a single typed amount: $10,000,000.00 keeps every product well inside 2^53. */
export const MAX_INPUT_CENTS = 1_000_000_000;
export const MAX_QUANTITY = 100_000;

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer (got ${value})`);
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParseError = "empty" | "invalid" | "negative" | "too_many_decimals" | "too_large";

export type ParseResult = { ok: true; value: number } | { ok: false; error: ParseError };

const DOLLARS_RE = /^(\d+)(?:\.(\d*))?$/;

/**
 * Parse a user-typed dollar amount into integer cents using string parsing only.
 * Accepts "40", "40.", "40.5", "40.50", ".5". Rejects negatives, letters,
 * thousands separators and more than two decimals.
 */
export function parseDollarsToCents(input: string): ParseResult {
  const s = input.trim();
  if (s === "") return { ok: false, error: "empty" };
  if (s.startsWith("-")) return { ok: false, error: "negative" };
  const normalised = s.startsWith(".") ? `0${s}` : s;
  const m = DOLLARS_RE.exec(normalised);
  if (!m) return { ok: false, error: "invalid" };
  const whole = m[1];
  const frac = m[2] ?? "";
  if (frac.length > 2) return { ok: false, error: "too_many_decimals" };
  // Concatenate digits: "40" + "50" -> "4050" cents. Pure string work, no float maths.
  const digits = (whole + frac.padEnd(2, "0")).replace(/^0+(?=\d)/, "");
  if (digits.length > 12) return { ok: false, error: "too_large" };
  const cents = Number(digits);
  if (!Number.isSafeInteger(cents) || cents > MAX_INPUT_CENTS) {
    return { ok: false, error: "too_large" };
  }
  return { ok: true, value: cents };
}

const WHOLE_RE = /^\d+$/;

/** Parse a positive whole number (quantity, exchange rate). Rejects decimals and signs. */
export function parseWholeNumber(input: string, max: number = Number.MAX_SAFE_INTEGER): ParseResult {
  const s = input.trim();
  if (s === "") return { ok: false, error: "empty" };
  if (s.startsWith("-")) return { ok: false, error: "negative" };
  if (!WHOLE_RE.test(s)) return { ok: false, error: "invalid" };
  const digits = s.replace(/^0+(?=\d)/, "");
  if (digits.length > 15) return { ok: false, error: "too_large" };
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n > max) return { ok: false, error: "too_large" };
  return { ok: true, value: n };
}

// ---------------------------------------------------------------------------
// Rate
// ---------------------------------------------------------------------------

export type RateCheck =
  | { ok: true; rate: number }
  | { ok: false; reason: "invalid" | "below_minimum"; fallback: number };

/**
 * Check a typed exchange rate against the minimum. Anything that is not a whole
 * number at or above the minimum is refused and the caller resets to `minRate`.
 */
export function checkRate(input: string, minRate: number): RateCheck {
  const parsed = parseWholeNumber(input);
  if (!parsed.ok || parsed.value < 1) return { ok: false, reason: "invalid", fallback: minRate };
  if (parsed.value < minRate) return { ok: false, reason: "below_minimum", fallback: minRate };
  return { ok: true, rate: parsed.value };
}

// ---------------------------------------------------------------------------
// Line maths
// ---------------------------------------------------------------------------

export function lineValueCents(unitPriceCents: number, quantity: number): number {
  assertCents(unitPriceCents, "unitPriceCents");
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity must be a positive integer (got ${quantity})`);
  }
  const value = BigInt(unitPriceCents) * BigInt(quantity);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("line value too large");
  return Number(value);
}

/**
 * Classify a discount against the line value with integer cross-multiplication:
 *   sand     0 < d*10000 <= v*sand_bp
 *   red      v*sand_bp < d*10000 <= v*red_bp
 *   blocked  d*10000 > v*red_bp
 * Boundaries are inclusive: exactly 3.00% is sand, exactly 5.00% is red.
 */
export function classifyDiscount(
  discountCents: number,
  valueCents: number,
  thresholds: DiscountThresholds,
): Band {
  assertCents(discountCents, "discountCents");
  assertCents(valueCents, "valueCents");
  if (discountCents === 0) return "none";
  const d = BigInt(discountCents) * BigInt(BP_PER_WHOLE);
  const v = BigInt(valueCents);
  if (d <= v * BigInt(thresholds.sandMaxBp)) return "sand";
  if (d <= v * BigInt(thresholds.redMaxBp)) return "red";
  return "blocked";
}

/**
 * Discount as whole basis points, rounded half-up. For display only
 * (1.94% is 194 bp). Mirrors SQL `round(d * 10000 / v)`.
 */
export function discountBasisPoints(discountCents: number, valueCents: number): number {
  assertCents(discountCents, "discountCents");
  assertCents(valueCents, "valueCents");
  if (valueCents === 0) return 0;
  const num = 2n * BigInt(discountCents) * BigInt(BP_PER_WHOLE) + BigInt(valueCents);
  const den = 2n * BigInt(valueCents);
  return Number(num / den);
}

export type LineError = "discount_exceeds_line_value";

export interface LineInput {
  unitPriceCents: number;
  quantity: number;
  discountCents: number;
}

export interface LineResult {
  lineValueCents: number;
  discountCents: number;
  lineTotalCents: number;
  discountBp: number;
  band: Band;
  error: LineError | null;
}

export function computeLine(input: LineInput, thresholds: DiscountThresholds): LineResult {
  const value = lineValueCents(input.unitPriceCents, input.quantity);
  assertCents(input.discountCents, "discountCents");
  if (input.discountCents > value) {
    return {
      lineValueCents: value,
      discountCents: input.discountCents,
      lineTotalCents: 0,
      discountBp: discountBasisPoints(input.discountCents, value),
      band: "blocked",
      error: "discount_exceeds_line_value",
    };
  }
  return {
    lineValueCents: value,
    discountCents: input.discountCents,
    lineTotalCents: value - input.discountCents,
    discountBp: discountBasisPoints(input.discountCents, value),
    band: classifyDiscount(input.discountCents, value, thresholds),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Order totals
// ---------------------------------------------------------------------------

/** Exact conversion: cents * (SDG per USD) = piastres, because 1 USD = 100 cents and 1 SDG = 100 piastres. */
export function usdCentsToSdgPiastres(cents: number, rate: number): bigint {
  assertCents(cents, "cents");
  if (!Number.isSafeInteger(rate) || rate < 1) throw new RangeError(`rate must be a positive integer (got ${rate})`);
  return BigInt(cents) * BigInt(rate);
}

export interface OrderTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  /** null when no valid rate is available yet. */
  totalSdgPiastres: bigint | null;
  hasBlocked: boolean;
  blockedCount: number;
}

export function computeOrderTotals(
  lines: ReadonlyArray<Pick<LineResult, "lineValueCents" | "discountCents" | "lineTotalCents" | "band">>,
  rate: number | null,
): OrderTotals {
  let subtotal = 0n;
  let discount = 0n;
  let blockedCount = 0;
  for (const line of lines) {
    subtotal += BigInt(line.lineValueCents);
    discount += BigInt(line.discountCents);
    if (line.band === "blocked") blockedCount += 1;
  }
  const total = subtotal - discount;
  if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("order total too large");
  const totalCents = Number(total);
  return {
    subtotalCents: Number(subtotal),
    discountCents: Number(discount),
    totalCents,
    totalSdgPiastres: rate === null ? null : usdCentsToSdgPiastres(totalCents, rate),
    hasBlocked: blockedCount > 0,
    blockedCount,
  };
}

// ---------------------------------------------------------------------------
// Formatting (Intl, locale-aware, no float division)
// ---------------------------------------------------------------------------

function splitHundredths(amount: bigint): { negative: boolean; whole: bigint; frac: bigint } {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  return { negative, whole: abs / 100n, frac: abs % 100n };
}

/** Build a decimal string ("2060.5" style) from integer hundredths, for Intl. */
function hundredthsToDecimalString(amount: bigint): { str: `${number}`; hasFraction: boolean } {
  const { negative, whole, frac } = splitHundredths(amount);
  const fracStr = frac.toString().padStart(2, "0");
  const str = `${negative ? "-" : ""}${whole.toString()}.${fracStr}` as `${number}`;
  return { str, hasFraction: frac !== 0n };
}

function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError(`not a safe integer: ${value}`);
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) throw new RangeError(`not an integer string: ${value}`);
  return BigInt(value);
}

/**
 * "$2,060" for whole dollars, "$40.50" when there are cents.
 * Intl.NumberFormat accepts decimal strings, so no float is ever created.
 */
export function formatUsd(cents: bigint | number | string, locale = "en-US"): string {
  const { str, hasFraction } = hundredthsToDecimalString(toBigInt(cents));
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(str);
}

/** "45,018,000 SDG"; decimals appear only when the piastres are non-zero. */
export function formatSdg(piastres: bigint | number | string, locale = "en-US"): string {
  const { str, hasFraction } = hundredthsToDecimalString(toBigInt(piastres));
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(str);
  return `${n} SDG`;
}

/** Plain grouped integer, e.g. the rate "8,200". */
export function formatInteger(value: bigint | number | string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toBigInt(value));
}

/** "1.94%" from 194 basis points. */
export function formatBasisPointsAsPercent(bp: number, locale = "en-US"): string {
  const { str } = hundredthsToDecimalString(BigInt(bp));
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(str)}%`;
}

/** Cents back into an editable input string ("40", "40.50"). */
export function centsToInputString(cents: number): string {
  assertCents(cents, "cents");
  const { whole, frac } = splitHundredths(BigInt(cents));
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** Sum of integer cents, done in bigint so it can never lose precision. */
export function sumCents(values: Iterable<number>): bigint {
  let total = 0n;
  for (const v of values) {
    assertCents(v, "cents");
    total += BigInt(v);
  }
  return total;
}
