"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { locale, t } from "@/i18n";
import { clearDraft, isDraftEmpty, loadDraft, newDraft, newLine, saveDraft, type DraftLine, type OrderDraft } from "@/lib/draft";
import { describeServerError, isNetworkError } from "@/lib/errors";
import { checkRate, formatBasisPointsAsPercent, formatInteger, formatSdg, formatUsd } from "@/lib/money";
import { evaluateDraft, toSavePayload } from "@/lib/order-form";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Product, Role, Settings } from "@/lib/types";
import { Card, Notice, Row, buttonPrimary, buttonSecondary, buttonWarning, inputClass } from "@/components/ui";
import { LineEditor } from "./LineEditor";

const SAVE_TIMEOUT_MS = 30_000;

export interface OrderFormProps {
  userId: string;
  role: Role;
  products: Product[];
  customers: Customer[];
  settings: Settings;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type SubmitError = { message: string; savedOrderId?: string };

export function OrderForm({ userId, role, products, customers, settings }: OrderFormProps) {
  const router = useRouter();
  const online = useOnline();
  const isOwner = role === "owner";
  const minRate = settings.min_rate;
  const thresholds = useMemo(
    () => ({ sandMaxBp: settings.discount_sand_max_bp, redMaxBp: settings.discount_red_max_bp }),
    [settings.discount_sand_max_bp, settings.discount_red_max_bp],
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // This component renders only in the browser (see OrderFormLoader), so the
  // saved draft can be read synchronously on first render.
  const [initial] = useState(() => {
    const stored = loadDraft(userId);
    return stored && !isDraftEmpty(stored)
      ? { draft: stored, restored: true }
      : { draft: newDraft(settings.default_rate), restored: false };
  });
  const [draft, setDraft] = useState<OrderDraft>(initial.draft);
  const [restored, setRestored] = useState(initial.restored);
  const [rateNotice, setRateNotice] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const inFlight = useRef(false);
  const finished = useRef(false);

  // Every keystroke is kept on the device.
  useEffect(() => {
    if (finished.current) return;
    saveDraft(userId, { ...draft, updatedAt: new Date().toISOString() });
  }, [draft, userId]);

  const evaluated = useMemo(
    () => evaluateDraft(draft, productMap, thresholds, minRate),
    [draft, productMap, thresholds, minRate],
  );
  const { totals } = evaluated;
  const blockedCount = totals.blockedCount;
  const adviserBlocked = !isOwner && blockedCount > 0;
  const minRateText = formatInteger(minRate, locale.intl);
  const redMaxText = formatBasisPointsAsPercent(thresholds.redMaxBp, locale.intl);

  function update(fn: (d: OrderDraft) => OrderDraft) {
    setDraft((d) => fn(d));
    setSubmitError(null);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    update((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  }

  function onRateBlur() {
    const check = checkRate(draft.rate, minRate);
    if (check.ok) {
      update((d) => ({ ...d, rate: String(check.rate) }));
      setRateNotice(null);
    } else {
      // Refuse, put the value back to the minimum, and say why.
      update((d) => ({ ...d, rate: String(check.fallback) }));
      setRateNotice(
        check.reason === "below_minimum"
          ? t("order.rateBelowMin", { min: minRateText })
          : t("order.rateInvalid", { min: minRateText }),
      );
    }
  }

  function discard() {
    if (!window.confirm(t("order.discardConfirm"))) return;
    clearDraft(userId);
    setDraft(newDraft(settings.default_rate));
    setRestored(false);
    setAttempted(false);
    setRateNotice(null);
    setSubmitError(null);
  }

  async function submit() {
    if (inFlight.current) return; // no double submission
    setAttempted(true);
    if (!evaluated.valid) {
      setSubmitError({ message: t("order.fixErrors") });
      return;
    }
    const rate = checkRate(draft.rate, minRate);
    if (!rate.ok) return;

    inFlight.current = true;
    setSaving(true);
    setSubmitError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
      const { data, error } = await createClient()
        .rpc("save_order", {
          p_customer_id: draft.customerId,
          p_rate: rate.rate,
          p_lines: toSavePayload(draft, evaluated),
          p_client_request_id: draft.clientRequestId, // same id on every retry of this draft
        })
        .abortSignal(controller.signal);

      if (error) {
        if (controller.signal.aborted) setSubmitError({ message: t("order.timeout") });
        else if (isNetworkError(error)) setSubmitError({ message: t("order.networkError") });
        else if (error.message === "request_already_saved_differently")
          setSubmitError({ message: t("order.alreadySaved"), savedOrderId: error.details ?? undefined });
        else setSubmitError({ message: describeServerError(error) });
        return;
      }

      finished.current = true;
      clearDraft(userId);
      router.replace(`/orders/${String(data)}?saved=1`);
      router.refresh();
    } catch {
      setSubmitError({ message: controller.signal.aborted ? t("order.timeout") : t("order.networkError") });
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      if (!finished.current) setSaving(false);
    }
  }

  const primaryLabel = saving
    ? t("order.saving")
    : isOwner && blockedCount > 0
      ? t("order.saveAndApprove", { count: blockedCount })
      : t("order.save");

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!adviserBlocked) void submit();
      }}
    >
      {!online && <Notice tone="warning" role="status">{t("order.offline")}</Notice>}
      {restored && (
        <Notice tone="info" role="status">
          {t("order.draftRestored")}
        </Notice>
      )}

      {/* Dealer */}
      <Card>
        <label htmlFor="customer" className="mb-1 block text-sm font-semibold">{t("order.customer")}</label>
        <select
          id="customer"
          className={inputClass}
          value={draft.customerId}
          aria-invalid={attempted && evaluated.missingCustomer}
          onChange={(e) => update((d) => ({ ...d, customerId: e.target.value }))}
        >
          <option value="">{t("order.chooseCustomer")}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.city ? `${c.name} — ${c.city}` : c.name}
            </option>
          ))}
        </select>
        {attempted && evaluated.missingCustomer && <p className="mt-1 text-sm text-red-700">{t("order.needCustomer")}</p>}
        {customers.length === 0 && <p className="mt-1 text-sm text-red-700">{t("order.noCustomers")}</p>}
      </Card>

      {/* Lines */}
      <section aria-labelledby="lines-heading" className="space-y-3">
        <h2 id="lines-heading" className="text-base font-semibold">{t("order.lines")}</h2>
        {products.length === 0 && <Notice tone="error">{t("order.noProducts")}</Notice>}
        {draft.lines.map((line, i) => (
          <LineEditor
            key={line.key}
            index={i}
            line={line}
            evaluated={evaluated.lines[i]}
            products={products}
            thresholds={thresholds}
            isOwner={isOwner}
            showRequired={attempted}
            canRemove={draft.lines.length > 1}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => update((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}
          />
        ))}
        <button type="button" className={`${buttonSecondary} w-full`} onClick={() => update((d) => ({ ...d, lines: [...d.lines, newLine()] }))}>
          + {t("order.addLine")}
        </button>
      </section>

      {/* Rate */}
      <Card>
        <label htmlFor="rate" className="mb-1 block text-sm font-semibold">{t("order.rate")}</label>
        <input
          id="rate"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className={`${inputClass} tabular`}
          value={draft.rate}
          aria-invalid={!evaluated.rate.ok}
          aria-describedby="rate-hint rate-notice"
          onChange={(e) => update((d) => ({ ...d, rate: e.target.value }))}
          onBlur={onRateBlur}
        />
        <p id="rate-hint" className="mt-1 text-xs text-neutral-600">{t("order.rateHint", { min: minRateText })}</p>
        <div id="rate-notice" aria-live="polite">
          {rateNotice && (
            <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900">{rateNotice}</p>
          )}
        </div>
      </Card>

      {/* Totals */}
      <Card>
        <h2 className="mb-2 text-base font-semibold">{t("order.totals")}</h2>
        <dl className="space-y-1">
          <Row label={t("order.subtotal")} value={formatUsd(totals.subtotalCents, locale.intl)} />
          <Row label={t("order.totalDiscount")} value={`− ${formatUsd(totals.discountCents, locale.intl)}`} />
          <Row label={t("order.totalUsd")} value={formatUsd(totals.totalCents, locale.intl)} strong />
          <Row
            label={t("order.totalSdg")}
            value={totals.totalSdgPiastres === null ? "—" : formatSdg(totals.totalSdgPiastres, locale.intl)}
            strong
          />
          {evaluated.rate.ok && (
            <p className="text-end text-xs text-neutral-600">
              {t("order.atRate", { rate: formatInteger(evaluated.rate.rate, locale.intl) })}
            </p>
          )}
        </dl>
      </Card>

      {blockedCount > 0 && (
        <Notice tone={isOwner ? "warning" : "error"} role="status">
          {isOwner
            ? t("order.ownerBlockedExplanation", { count: blockedCount, max: redMaxText })
            : t("order.blockedExplanation", { count: blockedCount, max: redMaxText })}
        </Notice>
      )}

      <div className="flex justify-end">
        <button type="button" className="min-h-11 px-2 text-sm text-neutral-600 underline" onClick={discard}>
          {t("order.discardDraft")}
        </button>
      </div>

      {/* Sticky action bar: totals and save always in reach of the thumb */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-2">
          <div aria-live="polite">
            {submitError && (
              <Notice tone="error" role="alert">
                {submitError.message}
                {submitError.savedOrderId && (
                  <>
                    {" "}
                    <Link className="font-semibold underline" href={`/orders/${submitError.savedOrderId}`}>
                      {t("order.openSavedOrder")}
                    </Link>
                  </>
                )}
              </Notice>
            )}
          </div>
          <div className="tabular flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold">{formatUsd(totals.totalCents, locale.intl)}</span>
            <span className="text-sm font-semibold text-neutral-800">
              {totals.totalSdgPiastres === null ? "—" : formatSdg(totals.totalSdgPiastres, locale.intl)}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              className={`${buttonPrimary} w-full sm:flex-1`}
              disabled={saving || adviserBlocked}
              aria-describedby={adviserBlocked ? "blocked-reason" : undefined}
            >
              {primaryLabel}
            </button>
            {adviserBlocked && (
              <button type="button" className={`${buttonWarning} w-full sm:flex-1`} disabled={saving} onClick={() => void submit()}>
                {saving ? t("order.saving") : t("order.sendForApproval")}
              </button>
            )}
          </div>
          {adviserBlocked && (
            <p id="blocked-reason" className="sr-only">
              {t("order.blockedExplanation", { count: blockedCount, max: redMaxText })}
            </p>
          )}
          <p className="text-center text-[11px] text-neutral-500">{t("order.draftSavedLocally")}</p>
        </div>
      </div>
    </form>
  );
}
