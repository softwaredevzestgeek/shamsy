import Link from "next/link";
import { formatDateTime, locale, t } from "@/i18n";
import { requireProfile } from "@/lib/auth";
import { bandLabel } from "@/lib/band-label";
import { formatBasisPointsAsPercent, formatInteger, formatSdg, formatUsd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ORDER_COLUMNS, ORDER_LINE_COLUMNS, type OrderLineRow, type OrderRow } from "@/lib/types";
import { BandBadge, Card, Notice, PageTitle, Row, StatusBadge, bandCardClass, cx } from "@/components/ui";

/**
 * Read-only view rendered ONLY from values stored on the order and its lines:
 * stored rate, stored cents, stored piastres, stored thresholds. Nothing is
 * looked up from current products or settings, so changing either never moves
 * this page by a single pound.
 */
export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  await requireProfile();
  const { id } = await params;
  const { saved } = await searchParams;
  const supabase = await createClient();

  const validId = /^[0-9a-f-]{36}$/i.test(id);
  const [orderRes, linesRes] = validId
    ? await Promise.all([
        supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle<OrderRow>(),
        supabase.from("order_lines").select(ORDER_LINE_COLUMNS).eq("order_id", id).order("line_no").returns<OrderLineRow[]>(),
      ])
    : [null, null];

  const order = orderRes?.data;
  if (!order) {
    return (
      <div className="space-y-3">
        <Notice tone="error" role="alert">{orderRes?.error ? t("errors.unknown", { message: orderRes.error.message }) : t("orderView.notFound")}</Notice>
        <Link href="/orders" className="underline">{t("orderView.back")}</Link>
      </div>
    );
  }

  const lines = linesRes?.data ?? [];
  const thresholds = { sandMaxBp: order.discount_sand_max_bp, redMaxBp: order.discount_red_max_bp };
  const usd = (c: number) => formatUsd(c, locale.intl);

  return (
    <div className="space-y-4">
      {saved === "1" && (
        <Notice tone={order.status === "confirmed" ? "success" : "warning"} role="status">
          {order.status === "confirmed" ? t("orderView.savedConfirmed") : t("orderView.savedPending")}
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>{t("orderView.title", { number: order.order_number })}</PageTitle>
        <StatusBadge status={order.status} />
      </div>

      <Card>
        <dl className="space-y-1">
          <Row label={t("orderView.dealer")} value={`${order.customer?.name ?? ""}${order.customer?.city ? ` · ${order.customer.city}` : ""}`} />
          {order.creator?.full_name && <Row label={t("orderView.createdBy")} value={order.creator.full_name} />}
          <Row label={t("orderView.createdAt")} value={formatDateTime(order.created_at)} />
          {order.confirmed_at && <Row label={t("orderView.confirmedAt")} value={formatDateTime(order.confirmed_at)} />}
          <Row label={t("orderView.rate")} value={t("orderView.rateValue", { rate: formatInteger(order.rate, locale.intl) })} strong />
        </dl>
      </Card>

      <ol className="space-y-3">
        {lines.map((l) => (
          <li key={l.id} className={cx("rounded-xl border p-3", bandCardClass[l.band])}>
            <p className="font-semibold">{l.product_name}</p>
            <p className="text-xs text-neutral-600">{l.product_sku}</p>
            <dl className="tabular mt-2 space-y-1 text-sm">
              <Row label={t("order.quantity")} value={t("orderView.qtyTimesPrice", { qty: formatInteger(l.quantity, locale.intl), price: usd(l.unit_price_cents) })} />
              <Row label={t("order.lineValue")} value={usd(l.line_value_cents)} />
              <Row label={t("order.discount")} value={`${usd(l.discount_cents)} · ${formatBasisPointsAsPercent(l.discount_bp_display, locale.intl)}`} />
              <Row label={t("order.lineTotal")} value={usd(l.line_total_cents)} strong />
            </dl>
            {l.band !== "none" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BandBadge band={l.band} label={bandLabel(l.band, thresholds)} />
                {l.approval_status !== "not_required" && (
                  <span className={cx("text-sm font-medium", l.approval_status === "approved" ? "text-emerald-800" : "text-red-900")}>
                    {l.approval_status === "approved" && l.approved_at
                      ? l.approved_by_name
                        ? t("approval.approved", { name: l.approved_by_name, date: formatDateTime(l.approved_at) })
                        : t("approval.approvedNoName", { date: formatDateTime(l.approved_at) })
                      : t("approval.pending")}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <Card>
        <h2 className="mb-2 text-base font-semibold">{t("order.totals")}</h2>
        <dl className="space-y-1">
          <Row label={t("order.subtotal")} value={usd(order.subtotal_cents)} />
          <Row label={t("order.totalDiscount")} value={`− ${usd(order.discount_cents)}`} />
          <Row label={t("order.totalUsd")} value={usd(order.total_cents)} strong />
          <Row label={t("order.totalSdg")} value={formatSdg(order.total_sdg_piastres, locale.intl)} strong />
        </dl>
        <p className="mt-2 text-xs text-neutral-600">
          {t("orderView.rulesAtSave", {
            sand: formatBasisPointsAsPercent(order.discount_sand_max_bp, locale.intl),
            red: formatBasisPointsAsPercent(order.discount_red_max_bp, locale.intl),
          })}
        </p>
        <p className="mt-1 text-xs text-neutral-600">{t("orderView.snapshotNote")}</p>
      </Card>

      <Link href="/orders" className="inline-flex min-h-11 items-center underline">{t("orderView.back")}</Link>
    </div>
  );
}
