"use client";

import { locale, t } from "@/i18n";
import { bandLabel } from "@/lib/band-label";
import type { DraftLine } from "@/lib/draft";
import { formatBasisPointsAsPercent, formatUsd, type DiscountThresholds } from "@/lib/money";
import type { EvaluatedLine } from "@/lib/order-form";
import type { Product } from "@/lib/types";
import { BandBadge, bandCardClass, cx, inputClass } from "@/components/ui";

interface Props {
  index: number;
  line: DraftLine;
  evaluated: EvaluatedLine;
  products: Product[];
  thresholds: DiscountThresholds;
  isOwner: boolean;
  showRequired: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

export function LineEditor({ index, line, evaluated, products, thresholds, isOwner, showRequired, canRemove, onChange, onRemove }: Props) {
  const n = index + 1;
  const id = (field: string) => `line-${line.key}-${field}`;
  const result = evaluated.result;
  const band = result && !result.error ? result.band : "none";
  const fmt = (cents: number) => formatUsd(cents, locale.intl);

  const productError = evaluated.productIssue && (showRequired || evaluated.productIssue === "productUnavailable")
    ? t(`lineErrors.${evaluated.productIssue}`)
    : null;
  const quantityError = evaluated.quantityIssue ? t(`lineErrors.${evaluated.quantityIssue}`) : null;
  const discountError = evaluated.discountIssue ? t(`lineErrors.${evaluated.discountIssue}`) : null;

  return (
    <fieldset className={cx("rounded-xl border p-3", bandCardClass[band])}>
      <legend className="sr-only">{t("order.line", { n })}</legend>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span aria-hidden className="text-sm font-semibold text-neutral-800">{t("order.line", { n })}</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={t("order.removeLine", { n })}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-neutral-600 hover:bg-black/5 disabled:opacity-30"
        >
          <span aria-hidden>×</span>
        </button>
      </div>

      <label htmlFor={id("product")} className="mb-1 block text-sm font-medium">{t("order.product")}</label>
      <select
        id={id("product")}
        className={inputClass}
        value={line.productId}
        aria-invalid={Boolean(productError)}
        onChange={(e) => onChange({ productId: e.target.value })}
      >
        <option value="">{t("order.chooseProduct")}</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {fmt(p.price_cents)}
          </option>
        ))}
      </select>
      {productError && <p className="mt-1 text-sm text-red-700">{productError}</p>}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("qty")} className="mb-1 block text-sm font-medium">{t("order.quantity")}</label>
          <input
            id={id("qty")}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            className={`${inputClass} tabular`}
            value={line.quantity}
            aria-invalid={Boolean(quantityError)}
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
          {quantityError && <p className="mt-1 text-sm text-red-700">{quantityError}</p>}
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium">{t("order.unitPrice")}</span>
          <p className="tabular flex min-h-12 items-center rounded-lg bg-neutral-100 px-3 text-base" aria-describedby={id("price-hint")}>
            {evaluated.product ? fmt(evaluated.product.price_cents) : "—"}
          </p>
          <p id={id("price-hint")} className="mt-1 text-xs text-neutral-500">{t("order.unitPriceHint")}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("discount")} className="mb-1 block text-sm font-medium">{t("order.discount")}</label>
          <input
            id={id("discount")}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            className={`${inputClass} tabular`}
            value={line.discount}
            aria-invalid={Boolean(discountError)}
            onChange={(e) => onChange({ discount: e.target.value })}
          />
          {discountError && <p className="mt-1 text-sm text-red-700">{discountError}</p>}
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium">{t("order.discountPercent")}</span>
          <p className="tabular flex min-h-12 items-center rounded-lg bg-white/70 px-3 text-base font-semibold">
            {result ? formatBasisPointsAsPercent(result.discountBp, locale.intl) : "—"}
          </p>
        </div>
      </div>

      <dl className="tabular mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-neutral-600">{t("order.lineValue")}</dt>
          <dd>{result ? fmt(result.lineValueCents) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-2 text-base font-semibold">
          <dt>{t("order.lineTotal")}</dt>
          <dd>{result && !result.error ? fmt(result.lineTotalCents) : "—"}</dd>
        </div>
      </dl>

      {result && !result.error && band !== "none" && (
        <div className="mt-2 space-y-1" aria-live="polite">
          <BandBadge band={band} label={bandLabel(band, thresholds)} />
          {band === "blocked" && (
            <p className="text-sm font-semibold text-red-900">
              {isOwner ? t("band.blockedOwner") : t("band.blockedAdviser")}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
