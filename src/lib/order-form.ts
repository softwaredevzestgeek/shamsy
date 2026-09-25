import {
  MAX_QUANTITY,
  checkRate,
  computeLine,
  computeOrderTotals,
  parseDollarsToCents,
  parseWholeNumber,
  type DiscountThresholds,
  type LineResult,
  type OrderTotals,
  type RateCheck,
} from "./money";
import type { OrderDraft } from "./draft";
import type { Product } from "./types";

export type LineIssue =
  | "needProduct"
  | "productUnavailable"
  | "quantity"
  | "discountFormat"
  | "discountDecimals"
  | "discountNegative"
  | "discountTooLarge";

export interface EvaluatedLine {
  key: string;
  product: Product | null;
  result: LineResult | null;
  quantityIssue: LineIssue | null;
  discountIssue: LineIssue | null;
  productIssue: LineIssue | null;
}

export interface EvaluatedDraft {
  lines: EvaluatedLine[];
  rate: RateCheck;
  totals: OrderTotals;
  missingCustomer: boolean;
  missingLines: boolean;
  hasLineIssues: boolean;
  /** true when everything is valid apart from blocked lines. */
  valid: boolean;
}

/** Turns the typed draft (strings) into integer amounts, bands and totals. Pure. */
export function evaluateDraft(
  draft: Pick<OrderDraft, "customerId" | "rate" | "lines">,
  products: ReadonlyMap<string, Product>,
  thresholds: DiscountThresholds,
  minRate: number,
): EvaluatedDraft {
  const lines = draft.lines.map((line): EvaluatedLine => {
    const product = line.productId ? products.get(line.productId) ?? null : null;
    const productIssue: LineIssue | null = !line.productId
      ? "needProduct"
      : product
        ? null
        : "productUnavailable";

    const qty = parseWholeNumber(line.quantity, MAX_QUANTITY);
    const quantityIssue: LineIssue | null = qty.ok && qty.value >= 1 ? null : "quantity";

    const discount = line.discount.trim() === "" ? ({ ok: true, value: 0 } as const) : parseDollarsToCents(line.discount);
    let discountIssue: LineIssue | null = null;
    if (!discount.ok) {
      discountIssue =
        discount.error === "too_many_decimals"
          ? "discountDecimals"
          : discount.error === "negative"
            ? "discountNegative"
            : discount.error === "too_large"
              ? "discountTooLarge"
              : "discountFormat";
    }

    let result: LineResult | null = null;
    if (product && qty.ok && qty.value >= 1 && discount.ok) {
      result = computeLine(
        { unitPriceCents: product.price_cents, quantity: qty.value, discountCents: discount.value },
        thresholds,
      );
      if (result.error === "discount_exceeds_line_value") discountIssue = "discountTooLarge";
    }

    return { key: line.key, product, result, quantityIssue, discountIssue, productIssue };
  });

  const rate = checkRate(draft.rate, minRate);
  const hasLineIssues = lines.some((l) => l.productIssue || l.quantityIssue || l.discountIssue);
  const complete = lines.flatMap((l) => (l.result && !l.result.error ? [l.result] : []));
  const totals = computeOrderTotals(complete, rate.ok ? rate.rate : null);
  const missingCustomer = draft.customerId === "";
  const missingLines = draft.lines.length === 0;

  return {
    lines,
    rate,
    totals,
    missingCustomer,
    missingLines,
    hasLineIssues,
    valid: !missingCustomer && !missingLines && !hasLineIssues && rate.ok,
  };
}

/** The exact payload sent to save_order: product, quantity, discount. No prices. */
export function toSavePayload(draft: Pick<OrderDraft, "lines">, evaluated: EvaluatedDraft) {
  return draft.lines.map((line, i) => {
    const r = evaluated.lines[i].result;
    if (!r) throw new Error("toSavePayload called on an invalid draft");
    return {
      product_id: line.productId,
      quantity: Number(line.quantity.trim()),
      discount_cents: r.discountCents,
    };
  });
}
