"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, locale, t } from "@/i18n";
import { describeServerError, isNetworkError } from "@/lib/errors";
import { formatBasisPointsAsPercent, formatInteger, formatUsd } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { Avatar, EmptyState, Notice, buttonPrimary, cx } from "@/components/ui";
import { IconChevron, IconShieldCheck, IconSpinner } from "@/components/icons";
import type { PendingLine } from "./types";

export function ApprovalsList({ lines }: { lines: PendingLine[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Approved lines disappear immediately; if the server refuses, they come back.
  const [visible, removeOptimistic] = useOptimistic(lines, (current, id: string) => current.filter((l) => l.id !== id));

  function approve(id: string) {
    if (isPending) return;
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      removeOptimistic(id);
      const { error: rpcError } = await createClient().rpc("approve_order_line", { p_line_id: id });
      if (rpcError) {
        setError(isNetworkError(rpcError) ? t("errors.network") : describeServerError(rpcError));
      }
      setBusyId(null);
      router.refresh();
    });
  }

  const usd = (c: number) => formatUsd(c, locale.intl);

  return (
    <div className="space-y-3">
      <div aria-live="polite">{error && <Notice tone="error" role="alert">{error}</Notice>}</div>

      {visible.length === 0 ? (
        <EmptyState icon={<IconShieldCheck size={22} />} title={t("approvals.empty")} />
      ) : (
        <>
          <p className="text-sm font-medium text-neutral-600">{t("approvals.count", { count: visible.length })}</p>
          <ul className="stagger space-y-3">
            {visible.map((l) => (
              <li key={l.id} className="overflow-hidden rounded-2xl border-2 border-red-700/80 bg-white shadow-sm">
                <div className="band-blocked flex items-center gap-3 px-4 py-3">
                  <Avatar name={l.order?.customer?.name ?? "?"} className="bg-white text-red-900" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">{l.order?.customer?.name}</p>
                    <p className="truncate text-xs text-neutral-700">
                      #{l.order?.order_number} · {t("order.line", { n: l.line_no })} · {l.order?.creator?.full_name}
                    </p>
                  </div>
                  <span className="tabular shrink-0 rounded-full bg-red-800 px-2.5 py-1 text-sm font-bold text-white">
                    ⛔ {formatBasisPointsAsPercent(l.discount_bp_display, locale.intl)}
                  </span>
                </div>

                <div className="p-4">
                  <p className="font-semibold text-neutral-900">{l.product_name}</p>
                  <p className="tabular text-xs text-neutral-500">
                    {t("orderView.qtyTimesPrice", { qty: formatInteger(l.quantity, locale.intl), price: usd(l.unit_price_cents) })}
                    {l.order ? ` · ${formatDateTime(l.order.created_at)}` : ""}
                  </p>
                  <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <dt className="text-[11px] text-neutral-500">{t("order.lineValue")}</dt>
                      <dd className="font-semibold">{usd(l.line_value_cents)}</dd>
                    </div>
                    <div className="rounded-xl bg-red-50 p-2">
                      <dt className="text-[11px] text-red-800">{t("order.discount")}</dt>
                      <dd className="font-bold text-red-900">{usd(l.discount_cents)}</dd>
                    </div>
                    <div className="rounded-xl bg-neutral-50 p-2">
                      <dt className="text-[11px] text-neutral-500">{t("order.lineTotal")}</dt>
                      <dd className="font-semibold">{usd(l.line_total_cents)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      className={cx(buttonPrimary, "flex-1")}
                      disabled={isPending}
                      onClick={() => approve(l.id)}
                    >
                      {busyId === l.id ? <IconSpinner /> : <IconShieldCheck size={18} />}
                      {busyId === l.id ? t("approvals.approving") : t("approvals.approve")}
                    </button>
                    {l.order && (
                      <Link
                        href={`/orders/${l.order.id}`}
                        className="inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        {t("approvals.openOrder")}
                        <IconChevron size={16} className="rtl:-scale-x-100" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
