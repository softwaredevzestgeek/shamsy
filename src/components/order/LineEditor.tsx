"use client";

import { useEffect, useRef } from "react";
import { locale, t } from "@/i18n";
import { bandLabel } from "@/lib/band-label";
import type { DraftLine } from "@/lib/draft";
import { MAX_QUANTITY, formatBasisPointsAsPercent, formatUsd, parseWholeNumber, type DiscountThresholds } from "@/lib/money";
import type { EvaluatedLine } from "@/lib/order-form";
import { BandBadge, bandCardClass, bandStripClass, cx, inputClass } from "@/components/ui";
import { IconBox, IconX } from "@/components/icons";

interface Props {
  index: number;
  line: DraftLine;
  evaluated: EvaluatedLine;
  thresholds: DiscountThresholds;
  isOwner: boolean;
  /** Just added from a product tile: bring it into view. */
  isNew?: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

const stepButton =
  "grid size-12 shrink-0 place-items-center text-xl font-semibold text-brand-700 transition hover:bg-brand-50 active:scale-90 disabled:text-neutral-300 disabled:active:scale-100";

export function LineEditor({ index, line, evaluated, thresholds, isOwner, isNew, onChange, onRemove }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!isNew) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [isNew]);

  const n = index + 1;
  const id = (field: string) => `line-${line.key}-${field}`;
  const result = evaluated.result;
  const band = result && !result.error ? result.band : "none";
  const fmt = (cents: number) => formatUsd(cents, locale.intl);
  const product = evaluated.product;

  const qty = parseWholeNumber(line.quantity, MAX_QUANTITY);
  const qtyValue = qty.ok ? qty.value : 0;
  const quantityError = evaluated.quantityIssue ? t(`lineErrors.${evaluated.quantityIssue}`) : null;
  const discountError = evaluated.discountIssue ? t(`lineErrors.${evaluated.discountIssue}`) : null;

  return (
    <li ref={ref} className={cx("relative animate-rise scroll-mb-48 overflow-hidden rounded-2xl border shadow-sm transition-colors duration-300", bandCardClass[band])}>
      <span aria-hidden className={cx("absolute inset-y-0 start-0 w-1.5 transition-colors duration-300", bandStripClass[band])} />
      <fieldset className="p-3 ps-5">
        <legend className="sr-only">{t("order.line", { n })}</legend>

        {/* Product */}
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <IconBox size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-neutral-900">
              {product ? product.name : t("lineErrors.productUnavailable")}
            </p>
            {product && (
              <p className="tabular text-xs text-neutral-500">
                {product.sku} · {fmt(product.price_cents)} {t("order.each")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("order.removeLine", { n })}
            className="-me-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-red-700 active:scale-90"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Quantity + discount */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={id("qty")} className="mb-1 block text-xs font-medium text-neutral-600">{t("order.quantity")}</label>
            <div
              className={cx(
                "flex items-center overflow-hidden rounded-xl border bg-white shadow-sm focus-within:ring-4 focus-within:ring-brand-500/15",
                quantityError ? "border-red-500" : "border-neutral-300 focus-within:border-brand-500",
              )}
            >
              <button
                type="button"
                className={stepButton}
                aria-label={t("order.decrease", { n })}
                disabled={qtyValue <= 1}
                onClick={() => onChange({ quantity: String(Math.max(1, qtyValue - 1)) })}
              >
                −
              </button>
              <input
                id={id("qty")}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                enterKeyHint="next"
                className="tabular h-12 w-full min-w-0 bg-transparent text-center text-base font-semibold focus:outline-none"
                value={line.quantity}
                aria-invalid={Boolean(quantityError)}
                onChange={(e) => onChange({ quantity: e.target.value })}
              />
              <button
                type="button"
                className={stepButton}
                aria-label={t("order.increase", { n })}
                disabled={qtyValue >= MAX_QUANTITY}
                onClick={() => onChange({ quantity: String(Math.min(MAX_QUANTITY, qtyValue + 1)) })}
              >
                +
              </button>
            </div>
            {quantityError && <p className="mt-1 text-xs text-red-700">{quantityError}</p>}
          </div>

          <div>
            <label htmlFor={id("discount")} className="mb-1 block text-xs font-medium text-neutral-600">{t("order.discount")}</label>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-neutral-400">$</span>
              <input
                id={id("discount")}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                placeholder="0"
                className={cx(inputClass, "tabular ps-7 pe-16 font-semibold")}
                value={line.discount}
                aria-invalid={Boolean(discountError)}
                aria-describedby={id("pct")}
                onChange={(e) => onChange({ discount: e.target.value })}
              />
              <span
                id={id("pct")}
                className={cx(
                  "tabular pointer-events-none absolute inset-y-2 end-2 grid place-items-center rounded-lg px-1.5 text-xs font-bold transition-colors",
                  band === "sand" && "bg-sand-100 text-sand-900",
                  band === "red" && "bg-red-100 text-red-900",
                  band === "blocked" && "bg-red-800 text-white",
                  band === "none" && "bg-neutral-100 text-neutral-500",
                )}
              >
                <span className="sr-only">{t("order.discountPercent")} </span>
                {result ? formatBasisPointsAsPercent(result.discountBp, locale.intl) : "—"}
              </span>
            </div>
            {discountError && <p className="mt-1 text-xs text-red-700">{discountError}</p>}
          </div>
        </div>

        {/* Result */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-black/5 pt-3">
          <div className="min-h-6">
            {result && !result.error && band !== "none" && <BandBadge band={band} label={bandLabel(band, thresholds)} />}
          </div>
          <dl className="tabular text-end">
            <div className="text-xs text-neutral-500">
              <dt className="inline">{t("order.lineValue")} </dt>
              <dd className="inline">{result ? fmt(result.lineValueCents) : "—"}</dd>
            </div>
            <div className="text-lg font-bold leading-tight text-neutral-900">
              <dt className="sr-only">{t("order.lineTotal")}</dt>
              <dd>{result && !result.error ? fmt(result.lineTotalCents) : "—"}</dd>
            </div>
          </dl>
        </div>

        {band === "blocked" && (
          <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-sm font-semibold text-red-900">
            {isOwner ? t("band.blockedOwner") : t("band.blockedAdviser")}
          </p>
        )}
      </fieldset>
    </li>
  );
}
