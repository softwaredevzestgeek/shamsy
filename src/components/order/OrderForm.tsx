"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { locale, t } from "@/i18n";
import { clearDraft, isDraftEmpty, loadDraft, newDraft, newLine, saveDraft, type DraftLine, type OrderDraft } from "@/lib/draft";
import { describeServerError, isNetworkError } from "@/lib/errors";
import { checkRate, formatBasisPointsAsPercent, formatInteger, formatSdg, formatUsd } from "@/lib/money";
import { evaluateDraft, toSavePayload, type EvaluatedDraft } from "@/lib/order-form";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Product, Role, Settings } from "@/lib/types";
import { Avatar, Card, Notice, SectionTitle, buttonPrimary, buttonWarning, cx, inputClass } from "@/components/ui";
import { IconCheck, IconExchange, IconPlus, IconSpinner, IconWifiOff } from "@/components/icons";
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

  // Rendered only in the browser (see OrderFormLoader), so the saved draft can
  // be read synchronously on the first render.
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
  const [dealerQuery, setDealerQuery] = useState("");
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const finished = useRef(false);

  // Every change is kept on the device.
  useEffect(() => {
    if (finished.current) return;
    saveDraft(userId, { ...draft, updatedAt: new Date().toISOString() });
  }, [draft, userId]);

  const evaluated = useMemo(
    () => evaluateDraft(draft, productMap, thresholds, minRate),
    [draft, productMap, thresholds, minRate],
  );
  const blockedCount = evaluated.totals.blockedCount;
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
      setSubmitError({
        message: evaluated.missingCustomer
          ? t("order.needCustomer")
          : evaluated.missingLines
            ? t("order.needLine")
            : t("order.fixErrors"),
      });
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

  function addProduct(productId: string) {
    const line = newLine(productId);
    setLastAddedKey(line.key);
    update((d) => ({ ...d, lines: [...d.lines, line] }));
  }

  const inOrder = new Map<string, number>();
  for (const l of draft.lines) inOrder.set(l.productId, (inOrder.get(l.productId) ?? 0) + 1);

  const q = dealerQuery.trim().toLowerCase();
  const visibleCustomers = q
    ? customers.filter((c) => `${c.name} ${c.city}`.toLowerCase().includes(q))
    : customers;

  const actions = (compact: boolean) => (
    <SaveActions
      compact={compact}
      saving={saving}
      isOwner={isOwner}
      blockedCount={blockedCount}
      adviserBlocked={adviserBlocked}
      redMaxText={redMaxText}
      onSendForApproval={() => void submit()}
    />
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!adviserBlocked) void submit();
      }}
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6"
    >
      <div className="space-y-5">
        {!online && (
          <Notice tone="warning" role="status" icon={<IconWifiOff size={18} />}>
            {t("order.offline")}
          </Notice>
        )}
        {restored && (
          <Notice tone="info" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("order.draftRestored")}</span>
              <button type="button" onClick={discard} className="font-semibold underline underline-offset-2">
                {t("order.discardDraft")}
              </button>
            </div>
          </Notice>
        )}

        {/* 1. Dealer */}
        <Card>
          <SectionTitle step={1}>{t("order.stepDealer")}</SectionTitle>
          {customers.length > 6 && (
            <input
              type="search"
              className={cx(inputClass, "mb-3")}
              placeholder={t("order.searchDealer")}
              aria-label={t("order.searchDealer")}
              value={dealerQuery}
              onChange={(e) => setDealerQuery(e.target.value)}
            />
          )}
          <div role="radiogroup" aria-label={t("order.customer")} className="grid gap-2 sm:grid-cols-3">
            {visibleCustomers.map((c) => {
              const selected = draft.customerId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => update((d) => ({ ...d, customerId: c.id }))}
                  className={cx(
                    "relative flex min-h-14 items-center gap-3 rounded-xl border p-2.5 text-start transition active:scale-[0.98]",
                    selected
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/30"
                      : "border-neutral-200 bg-white hover:border-neutral-300",
                    attempted && evaluated.missingCustomer && "border-red-300",
                  )}
                >
                  <Avatar name={c.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-neutral-900">{c.name}</span>
                    <span className="block truncate text-xs text-neutral-500">{c.city}</span>
                  </span>
                  {selected && (
                    <span className="absolute end-2 top-2 grid size-5 animate-pop place-items-center rounded-full bg-brand-600 text-white">
                      <IconCheck size={12} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {visibleCustomers.length === 0 && <p className="text-sm text-neutral-600">{customers.length ? t("order.noDealerMatch") : t("order.noCustomers")}</p>}
          {attempted && evaluated.missingCustomer && <p className="mt-2 text-sm font-medium text-red-700">{t("order.needCustomer")}</p>}
        </Card>

        {/* 2. Products */}
        <Card>
          <SectionTitle step={2}>{t("order.stepProducts")}</SectionTitle>
          {draft.lines.length === 0 ? (
            <p className={cx("mb-3 rounded-xl border border-dashed px-3 py-4 text-center text-sm", attempted ? "border-red-300 text-red-800" : "border-neutral-300 text-neutral-600")}>
              {t("order.emptyLines")}
            </p>
          ) : (
            <ul className="mb-4 space-y-3">
              {draft.lines.map((line, i) => (
                <LineEditor
                  key={line.key}
                  index={i}
                  line={line}
                  evaluated={evaluated.lines[i]}
                  thresholds={thresholds}
                  isOwner={isOwner}
                  isNew={line.key === lastAddedKey}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => update((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}
                />
              ))}
            </ul>
          )}

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{t("order.addProductTitle")}</p>
          <div className="grid grid-cols-2 gap-2">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p.id)}
                className="group relative flex min-h-16 flex-col justify-between gap-1 rounded-xl border border-neutral-200 bg-neutral-50/60 p-2.5 text-start transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.97]"
              >
                <span className="line-clamp-2 pe-6 text-sm font-semibold leading-snug text-neutral-900">{p.name}</span>
                {inOrder.has(p.id) && (
                  <span
                    key={inOrder.get(p.id)}
                    className="absolute end-1.5 top-1.5 animate-pop rounded-full bg-sun-400 px-1.5 text-[11px] font-bold text-brand-900"
                  >
                    {t("order.inOrder", { count: inOrder.get(p.id) ?? 0 })}
                  </span>
                )}
                <span className="flex items-center justify-between gap-1">
                  <span className="tabular text-sm font-bold text-brand-700">{formatUsd(p.price_cents, locale.intl)}</span>
                  <span className="grid size-6 place-items-center rounded-full bg-brand-700 text-white transition group-hover:scale-110">
                    <IconPlus size={14} strokeWidth={3} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{t("order.addProductHint")}</p>
          {products.length === 0 && <Notice tone="error">{t("order.noProducts")}</Notice>}
        </Card>

        {/* 3. Rate */}
        <Card>
          <SectionTitle step={3}>{t("order.stepRate")}</SectionTitle>
          <label htmlFor="rate" className="sr-only">{t("order.rate")}</label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-neutral-400">
              <IconExchange size={18} />
            </span>
            <input
              id="rate"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              className={cx(inputClass, "tabular h-14 ps-11 pe-28 text-xl font-bold")}
              value={draft.rate}
              aria-invalid={!evaluated.rate.ok}
              aria-describedby="rate-hint rate-notice"
              onChange={(e) => update((d) => ({ ...d, rate: e.target.value }))}
              onBlur={onRateBlur}
            />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3.5 grid place-items-center text-sm font-medium text-neutral-500">
              {t("order.sdgPerUsd")}
            </span>
          </div>
          <p id="rate-hint" className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold">{t("order.minChip", { min: minRateText })}</span>
            {t("order.rateHint", { min: minRateText })}
          </p>
          <div id="rate-notice" aria-live="polite">
            {rateNotice && (
              <div className="mt-2">
                <Notice tone="warning">{rateNotice}</Notice>
              </div>
            )}
          </div>
        </Card>

        {blockedCount > 0 && (
          <div className="lg:hidden">
            <Notice tone={isOwner ? "warning" : "error"} role="status">
              {isOwner
                ? t("order.ownerBlockedExplanation", { count: blockedCount, max: redMaxText })
                : t("order.blockedExplanation", { count: blockedCount, max: redMaxText })}
            </Notice>
          </div>
        )}

        <div className="flex justify-center lg:justify-start">
          <button type="button" className="min-h-11 px-2 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800" onClick={discard}>
            {t("order.discardDraft")}
          </button>
        </div>
      </div>

      {/* Desktop: sticky summary panel */}
      <aside className="hidden lg:sticky lg:top-32 lg:block">
        <SummaryPanel evaluated={evaluated} lineCount={draft.lines.length}>
          <SubmitFeedback error={submitError} />
          {actions(false)}
        </SummaryPanel>
      </aside>

      {/* Phone: compact bar, always within thumb reach */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/10 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md lg:hidden">
        <div className="mx-auto max-w-2xl space-y-2.5">
          <SubmitFeedback error={submitError} />
          <div className="tabular flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{t("order.dealerPays")}</p>
              <p key={String(evaluated.totals.totalSdgPiastres)} className="animate-pop truncate text-xl font-extrabold text-brand-800">
                {evaluated.totals.totalSdgPiastres === null ? "—" : formatSdg(evaluated.totals.totalSdgPiastres, locale.intl)}
              </p>
            </div>
            <div className="text-end">
              <p className="text-lg font-bold text-neutral-900">{formatUsd(evaluated.totals.totalCents, locale.intl)}</p>
              {evaluated.rate.ok && (
                <p className="text-[11px] text-neutral-500">{t("order.atRate", { rate: formatInteger(evaluated.rate.rate, locale.intl) })}</p>
              )}
            </div>
          </div>
          {actions(true)}
        </div>
      </div>
    </form>
  );
}

function SubmitFeedback({ error }: { error: SubmitError | null }) {
  return (
    <div aria-live="polite">
      {error && (
        <Notice tone="error" role="alert">
          {error.message}
          {error.savedOrderId && (
            <>
              {" "}
              <Link className="font-semibold underline" href={`/orders/${error.savedOrderId}`}>
                {t("order.openSavedOrder")}
              </Link>
            </>
          )}
        </Notice>
      )}
    </div>
  );
}

function SaveActions({
  compact,
  saving,
  isOwner,
  blockedCount,
  adviserBlocked,
  redMaxText,
  onSendForApproval,
}: {
  compact: boolean;
  saving: boolean;
  isOwner: boolean;
  blockedCount: number;
  adviserBlocked: boolean;
  redMaxText: string;
  onSendForApproval: () => void;
}) {
  const label = isOwner && blockedCount > 0 ? t("order.saveAndApprove", { count: blockedCount }) : t("order.save");
  return (
    <div className="space-y-2">
      {blockedCount > 0 && !compact && (
        <p className={cx("rounded-xl px-3 py-2 text-xs font-medium", isOwner ? "bg-amber-50 text-amber-950" : "bg-red-50 text-red-900")}>
          {isOwner
            ? t("order.ownerBlockedExplanation", { count: blockedCount, max: redMaxText })
            : t("order.blockedExplanation", { count: blockedCount, max: redMaxText })}
        </p>
      )}
      {compact && adviserBlocked && (
        <p className="text-center text-xs font-medium text-red-800">{t("order.blockedShort")}</p>
      )}
      <div className={cx("flex gap-2", compact ? "flex-row-reverse" : "flex-col")}>
        {adviserBlocked && (
          <button type="button" className={cx(buttonWarning, "w-full", compact && "flex-[1.4] px-3 text-sm")} disabled={saving} onClick={onSendForApproval}>
            {saving ? <IconSpinner /> : null}
            {saving ? t("order.saving") : t("order.sendForApproval")}
          </button>
        )}
        <button
          type="submit"
          className={cx(buttonPrimary, "w-full", compact && adviserBlocked && "flex-1 px-3 text-sm")}
          disabled={saving || adviserBlocked}
        >
          {saving && !adviserBlocked ? <IconSpinner /> : null}
          {saving && !adviserBlocked ? t("order.saving") : label}
        </button>
      </div>
    </div>
  );
}

function SummaryPanel({
  evaluated,
  lineCount,
  children,
}: {
  evaluated: EvaluatedDraft;
  lineCount: number;
  children: React.ReactNode;
}) {
  const { totals, rate } = evaluated;
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-lg shadow-black/5">
      <div className="bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">{t("order.dealerPays")}</p>
        <p key={String(totals.totalSdgPiastres)} className="tabular mt-1 animate-pop text-3xl font-extrabold tracking-tight">
          {totals.totalSdgPiastres === null ? "—" : formatSdg(totals.totalSdgPiastres, locale.intl)}
        </p>
        <p className="tabular mt-1 text-lg font-semibold text-sun-300">{formatUsd(totals.totalCents, locale.intl)}</p>
        {rate.ok && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs">
            <IconExchange size={14} />
            {t("order.atRate", { rate: formatInteger(rate.rate, locale.intl) })}
          </p>
        )}
      </div>
      <dl className="tabular space-y-1.5 p-5 pb-3 text-sm">
        <div className="flex justify-between text-neutral-500">
          <dt>{t("order.summary")}</dt>
          <dd>{t("order.lineCount", { count: lineCount })}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-600">{t("order.subtotal")}</dt>
          <dd>{formatUsd(totals.subtotalCents, locale.intl)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-600">{t("order.totalDiscount")}</dt>
          <dd className="text-red-700">− {formatUsd(totals.discountCents, locale.intl)}</dd>
        </div>
        <div className="flex justify-between border-t border-black/5 pt-1.5 font-bold">
          <dt>{t("order.totalUsd")}</dt>
          <dd>{formatUsd(totals.totalCents, locale.intl)}</dd>
        </div>
      </dl>
      <div className="space-y-3 p-5 pt-2">{children}</div>
      <p className="border-t border-black/5 px-5 py-2.5 text-center text-[11px] text-neutral-500">{t("order.draftSavedLocally")}</p>
    </div>
  );
}
