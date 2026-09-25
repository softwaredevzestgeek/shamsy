import { describe, expect, it } from "vitest";
import { evaluateDraft, toSavePayload } from "./order-form";
import type { Product } from "./types";

const products = new Map<string, Product>(
  [
    { id: "spf", sku: "SPF-6000-ES-PLUS", name: "SPF 6000 ES Plus", price_cents: 51_500 },
    { id: "h5", sku: "HOPE-5.0L-B1", name: "Hope 5.0L-B1", price_cents: 81_000 },
    { id: "h16", sku: "HOPE-16.0LM-A1", name: "Hope 16.0LM-A1", price_cents: 207_000 },
  ].map((p) => [p.id, p]),
);
const thresholds = { sandMaxBp: 300, redMaxBp: 500 };

const line = (key: string, productId: string, quantity: string, discount: string) => ({ key, productId, quantity, discount });

describe("evaluateDraft with the worked example typed as strings", () => {
  const draft = {
    customerId: "ahmed",
    rate: "8200",
    lines: [line("1", "spf", "4", "40"), line("2", "h5", "2", "70.00"), line("3", "h16", "1", "150")],
  };

  it("classifies and totals exactly", () => {
    const e = evaluateDraft(draft, products, thresholds, 8000);
    expect(e.lines.map((l) => l.result?.band)).toEqual(["sand", "red", "blocked"]);
    expect(e.totals.totalCents).toBe(549_000);
    expect(e.totals.totalSdgPiastres).toBe(4_501_800_000n);
    expect(e.totals.blockedCount).toBe(1);
    expect(e.valid).toBe(true);
  });

  it("without line 3 totals $3,570 = 29,274,000 SDG", () => {
    const e = evaluateDraft({ ...draft, lines: draft.lines.slice(0, 2) }, products, thresholds, 8000);
    expect(e.totals.totalCents).toBe(357_000);
    expect(e.totals.totalSdgPiastres).toBe(2_927_400_000n);
    expect(e.totals.hasBlocked).toBe(false);
  });

  it("sends no prices to the server", () => {
    const e = evaluateDraft(draft, products, thresholds, 8000);
    expect(toSavePayload(draft, e)).toEqual([
      { product_id: "spf", quantity: 4, discount_cents: 4_000 },
      { product_id: "h5", quantity: 2, discount_cents: 7_000 },
      { product_id: "h16", quantity: 1, discount_cents: 15_000 },
    ]);
  });
});

describe("evaluateDraft validation", () => {
  it("refuses a rate of 7,900 and shows no SDG total", () => {
    const e = evaluateDraft({ customerId: "a", rate: "7900", lines: [line("1", "spf", "1", "")] }, products, thresholds, 8000);
    expect(e.rate).toEqual({ ok: false, reason: "below_minimum", fallback: 8000 });
    expect(e.totals.totalSdgPiastres).toBeNull();
    expect(e.valid).toBe(false);
  });

  it("flags bad line input", () => {
    const e = evaluateDraft(
      {
        customerId: "",
        rate: "8000",
        lines: [
          line("1", "", "1", ""),
          line("2", "gone", "1", ""),
          line("3", "spf", "0", ""),
          line("4", "spf", "1", "40.505"),
          line("5", "spf", "1", "515.01"),
          line("6", "spf", "1", "-1"),
        ],
      },
      products,
      thresholds,
      8000,
    );
    expect(e.lines.map((l) => l.productIssue ?? l.quantityIssue ?? l.discountIssue)).toEqual([
      "needProduct",
      "productUnavailable",
      "quantity",
      "discountDecimals",
      "discountTooLarge",
      "discountNegative",
    ]);
    expect(e.missingCustomer).toBe(true);
    expect(e.valid).toBe(false);
  });
});
