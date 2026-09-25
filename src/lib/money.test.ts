import { describe, expect, it } from "vitest";
import {
  centsToInputString,
  checkRate,
  classifyDiscount,
  computeLine,
  computeOrderTotals,
  discountBasisPoints,
  formatBasisPointsAsPercent,
  formatInteger,
  formatSdg,
  formatUsd,
  lineValueCents,
  parseDollarsToCents,
  parseWholeNumber,
  usdCentsToSdgPiastres,
  type DiscountThresholds,
} from "./money";

const T: DiscountThresholds = { sandMaxBp: 300, redMaxBp: 500 };

describe("parseDollarsToCents", () => {
  it.each([
    ["40", 4000],
    ["40.5", 4050],
    ["40.50", 4050],
    ["40.", 4000],
    [".5", 50],
    ["0", 0],
    ["0.01", 1],
    [" 150 ", 15000],
    ["007.10", 710],
    ["2070", 207000],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseDollarsToCents(input)).toEqual({ ok: true, value: cents });
  });

  it.each([
    ["40.505", "too_many_decimals"],
    ["0.001", "too_many_decimals"],
    ["abc", "invalid"],
    ["4o", "invalid"],
    ["1,000", "invalid"],
    ["1e3", "invalid"],
    ["", "empty"],
    ["   ", "empty"],
    ["-5", "negative"],
    ["-0.01", "negative"],
    ["99999999999999", "too_large"],
  ])("rejects %j (%s)", (input, error) => {
    expect(parseDollarsToCents(input)).toEqual({ ok: false, error });
  });

  it("does not suffer from float artefacts (0.29 * 100 = 28.999…)", () => {
    expect(parseDollarsToCents("0.29")).toEqual({ ok: true, value: 29 });
    expect(parseDollarsToCents("1.15")).toEqual({ ok: true, value: 115 });
    expect(parseDollarsToCents("4.35")).toEqual({ ok: true, value: 435 });
  });
});

describe("parseWholeNumber / checkRate", () => {
  it("parses whole numbers only", () => {
    expect(parseWholeNumber("8200")).toEqual({ ok: true, value: 8200 });
    expect(parseWholeNumber("8200.5")).toEqual({ ok: false, error: "invalid" });
    expect(parseWholeNumber("-1")).toEqual({ ok: false, error: "negative" });
    expect(parseWholeNumber("12", 10)).toEqual({ ok: false, error: "too_large" });
  });

  it("refuses 7,900 and falls back to the minimum 8,000", () => {
    expect(checkRate("7900", 8000)).toEqual({ ok: false, reason: "below_minimum", fallback: 8000 });
  });

  it("accepts the minimum itself and anything higher", () => {
    expect(checkRate("8000", 8000)).toEqual({ ok: true, rate: 8000 });
    expect(checkRate("8200", 8000)).toEqual({ ok: true, rate: 8200 });
    expect(checkRate("11000", 8000)).toEqual({ ok: true, rate: 11000 });
  });

  it("refuses non-numbers and zero", () => {
    expect(checkRate("", 8000)).toMatchObject({ ok: false, reason: "invalid", fallback: 8000 });
    expect(checkRate("8,200", 8000)).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkRate("8200.5", 8000)).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkRate("0", 8000)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("classifyDiscount band boundaries (line value $1,000.00)", () => {
  const v = 100_000; // $1,000.00
  it.each([
    [0, "none"], // 0%
    [1, "sand"], // 0.001%
    [3_000, "sand"], // exactly 3.00%
    [3_001, "red"], // just above 3%
    [5_000, "red"], // exactly 5.00%
    [5_001, "blocked"], // just above 5%
    [100_000, "blocked"], // 100%
  ] as const)("%i cents -> %s", (d, band) => {
    expect(classifyDiscount(d, v, T)).toBe(band);
  });

  it("uses the thresholds passed in (they come from settings)", () => {
    expect(classifyDiscount(3_001, v, { sandMaxBp: 400, redMaxBp: 600 })).toBe("sand");
    expect(classifyDiscount(5_001, v, { sandMaxBp: 400, redMaxBp: 600 })).toBe("red");
  });

  it("has no rounding at the edge where a float division would", () => {
    // 3% of $0.01 * 3 = 0.09 cents: 1 cent on a 3 cent line is 33% -> blocked
    expect(classifyDiscount(1, 3, T)).toBe("blocked");
    // 3% of $333.33 is 999.99 cents, so 1000 cents is just above 3%
    expect(classifyDiscount(999, 33_333, T)).toBe("sand");
    expect(classifyDiscount(1_000, 33_333, T)).toBe("red");
  });
});

describe("computeLine", () => {
  it("rejects a discount larger than the line value", () => {
    const r = computeLine({ unitPriceCents: 51_500, quantity: 1, discountCents: 51_501 }, T);
    expect(r.error).toBe("discount_exceeds_line_value");
  });

  it("allows a 100% discount only as a blocked line", () => {
    const r = computeLine({ unitPriceCents: 51_500, quantity: 1, discountCents: 51_500 }, T);
    expect(r).toMatchObject({ error: null, band: "blocked", lineTotalCents: 0 });
  });

  it("rejects bad quantities", () => {
    expect(() => lineValueCents(51_500, 0)).toThrow();
    expect(() => lineValueCents(51_500, 1.5)).toThrow();
  });
});

describe("the client's worked example at 8,200 SDG/USD", () => {
  const rate = 8_200;
  const spf = computeLine({ unitPriceCents: 51_500, quantity: 4, discountCents: 4_000 }, T);
  const hope5 = computeLine({ unitPriceCents: 81_000, quantity: 2, discountCents: 7_000 }, T);
  const hope16 = computeLine({ unitPriceCents: 207_000, quantity: 1, discountCents: 15_000 }, T);

  it("line 1: SPF 6000 ES Plus 4 x $515", () => {
    expect(spf).toEqual({
      lineValueCents: 206_000,
      discountCents: 4_000,
      lineTotalCents: 202_000,
      discountBp: 194,
      band: "sand",
      error: null,
    });
    expect(formatUsd(spf.lineValueCents)).toBe("$2,060");
    expect(formatUsd(spf.discountCents)).toBe("$40");
    expect(formatBasisPointsAsPercent(spf.discountBp)).toBe("1.94%");
    expect(formatUsd(spf.lineTotalCents)).toBe("$2,020");
  });

  it("line 2: Hope 5.0L-B1 2 x $810", () => {
    expect(hope5).toEqual({
      lineValueCents: 162_000,
      discountCents: 7_000,
      lineTotalCents: 155_000,
      discountBp: 432,
      band: "red",
      error: null,
    });
    expect(formatBasisPointsAsPercent(hope5.discountBp)).toBe("4.32%");
    expect(formatUsd(hope5.lineTotalCents)).toBe("$1,550");
  });

  it("line 3: Hope 16.0LM-A1 1 x $2,070", () => {
    expect(hope16).toEqual({
      lineValueCents: 207_000,
      discountCents: 15_000,
      lineTotalCents: 192_000,
      discountBp: 725,
      band: "blocked",
      error: null,
    });
    expect(formatBasisPointsAsPercent(hope16.discountBp)).toBe("7.25%");
    expect(formatUsd(hope16.lineTotalCents)).toBe("$1,920");
  });

  it("without line 3: $3,570 = 29,274,000 SDG, saveable", () => {
    const totals = computeOrderTotals([spf, hope5], rate);
    expect(totals).toEqual({
      subtotalCents: 368_000,
      discountCents: 11_000,
      totalCents: 357_000,
      totalSdgPiastres: 2_927_400_000n,
      hasBlocked: false,
      blockedCount: 0,
    });
    expect(formatUsd(totals.totalCents)).toBe("$3,570");
    expect(formatSdg(totals.totalSdgPiastres!)).toBe("29,274,000 SDG");
  });

  it("with line 3 (approved): $5,490 = 45,018,000 SDG", () => {
    const totals = computeOrderTotals([spf, hope5, hope16], rate);
    expect(totals.totalCents).toBe(549_000);
    expect(totals.totalSdgPiastres).toBe(4_501_800_000n);
    expect(totals.hasBlocked).toBe(true);
    expect(totals.blockedCount).toBe(1);
    expect(formatUsd(totals.totalCents)).toBe("$5,490");
    expect(formatSdg(totals.totalSdgPiastres!)).toBe("45,018,000 SDG");
    expect(formatInteger(rate)).toBe("8,200");
  });
});

describe("SDG conversion and formatting", () => {
  it("is exact integer multiplication", () => {
    expect(usdCentsToSdgPiastres(1, 8_200)).toBe(8_200n); // $0.01 -> 82.00 SDG
    expect(usdCentsToSdgPiastres(549_000, 8_200)).toBe(4_501_800_000n);
  });

  it("stays exact beyond 2^53", () => {
    // $90,000,000,000.01 at 1,000,000 SDG/USD would lose digits as a float
    const p = usdCentsToSdgPiastres(9_000_000_000_001, 1_000_000);
    expect(p).toBe(9_000_000_000_001_000_000n);
    expect(formatSdg(p)).toBe("90,000,000,000,010,000 SDG");
  });

  it("shows decimals only when non-zero", () => {
    expect(formatSdg(4_501_800_050n)).toBe("45,018,000.50 SDG");
    expect(formatSdg("2927400000")).toBe("29,274,000 SDG");
    expect(formatUsd(4_050)).toBe("$40.50");
    expect(formatUsd(5)).toBe("$0.05");
  });

  it("round-trips cents to input strings", () => {
    expect(centsToInputString(4_000)).toBe("40");
    expect(centsToInputString(4_050)).toBe("40.50");
    expect(centsToInputString(5)).toBe("0.05");
  });

  it("rounds the display percentage half-up", () => {
    expect(discountBasisPoints(1, 200)).toBe(50); // 0.5% exactly
    expect(discountBasisPoints(1, 30_000)).toBe(0); // 0.0033% -> 0.00%
    expect(discountBasisPoints(1, 20_000)).toBe(1); // 0.005% -> 0.01% (half-up)
  });
});
