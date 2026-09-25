import Link from "next/link";
import { formatDateTime, locale, t } from "@/i18n";
import { requireProfile } from "@/lib/auth";
import { bandLabel } from "@/lib/band-label";
import { formatBasisPointsAsPercent, formatInteger, formatSdg, formatUsd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ORDER_COLUMNS, ORDER_LINE_COLUMNS, type OrderLineRow, type OrderRow } from "@/lib/types";
import { Avatar, BandBadge, Card, Notice, StatusBadge, bandCardClass, bandStripClass, cx } from "@/components/ui";
import { IconArrowBack, IconCheck, IconClock, IconExchange, IconShieldCheck, IconWhatsApp } from "@/components/icons";

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
        <Notice tone="error" role="alert">
          {orderRes?.error ? t("errors.unknown", { message: orderRes.error.message }) : t("orderView.notFound")}
        </Notice>
        <Link href="/orders" className="underline">{t("orderView.back")}</Link>
      </div>
    );
  }

  const lines = linesRes?.data ?? [];
  const thresholds = { sandMaxBp: order.discount_sand_max_bp, redMaxBp: order.discount_red_max_bp };
  const usd = (c: number) => formatUsd(c, locale.intl);
  const confirmed = order.status === "confirmed";

  // WhatsApp share text, built only from the stored values (like the rest of this page).
  const shareText = t("orderView.shareText", {
    number: order.order_number,
    dealer: order.customer?.name ?? "",
    lines: lines
      .map((l) => t("orderView.shareLine", { qty: formatInteger(l.quantity, locale.intl), product: l.product_name, total: usd(l.line_total_cents) }))
      .join("\n"),
    usd: usd(order.total_cents),
    rate: formatInteger(order.rate, locale.intl),
    sdg: formatSdg(order.total_sdg_piastres, locale.intl),
  }) + (confirmed ? "" : `\n${t("orderView.pendingNote")}`);

  return (
    <div className="space-y-5">
      <Link href="/orders" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900">
        <IconArrowBack size={16} className="rtl:-scale-x-100" />
        {t("orderView.back")}
      </Link>

      {saved === "1" && (
        <Notice tone={confirmed ? "success" : "warning"} role="status">
          {confirmed ? t("orderView.savedConfirmed") : t("orderView.savedPending")}
        </Notice>
      )}

      {/* Hero */}
      <section className="animate-rise overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 to-brand-600 text-white shadow-lg shadow-brand-900/15">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={order.customer?.name ?? "?"} tone="bg-white/15 text-white" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{t("orderView.title", { number: order.order_number })}</h1>
              <p className="truncate text-sm text-white/75">
                {order.customer?.name}
                {order.customer?.city ? ` · ${order.customer.city}` : ""}
              </p>
            </div>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <div className="tabular px-5">
          <p className="text-xs font-medium uppercase tracking-wide text-white/65">{t("order.dealerPays")}</p>
          <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">{formatSdg(order.total_sdg_piastres, locale.intl)}</p>
          <p className="text-lg font-semibold text-sun-300">{usd(order.total_cents)}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 bg-black/10 px-5 py-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 font-semibold">
            <IconExchange size={14} />
            {t("orderView.rateValue", { rate: formatInteger(order.rate, locale.intl) })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <IconClock size={14} />
            {formatDateTime(order.created_at)}
          </span>
          {order.creator?.full_name && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
              {t("orderView.createdBy")}: {order.creator.full_name}
            </span>
          )}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ms-auto inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#25d366] px-3 py-1 font-semibold text-[#063b1f] transition hover:brightness-105 active:scale-95"
          >
            <IconWhatsApp size={14} />
            {t("orderView.shareWhatsApp")}
          </a>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* Lines */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("orderView.lines")}</h2>
          <ol className="stagger space-y-3">
            {lines.map((l) => (
              <li key={l.id} className={cx("relative overflow-hidden rounded-2xl border p-4 ps-5 shadow-sm", bandCardClass[l.band])}>
                <span aria-hidden className={cx("absolute inset-y-0 start-0 w-1.5", bandStripClass[l.band])} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{l.product_name}</p>
                    <p className="tabular text-xs text-neutral-500">
                      {l.product_sku} · {t("orderView.qtyTimesPrice", { qty: formatInteger(l.quantity, locale.intl), price: usd(l.unit_price_cents) })}
                    </p>
                  </div>
                  <p className="tabular shrink-0 text-lg font-bold text-neutral-900">{usd(l.line_total_cents)}</p>
                </div>
                <dl className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                  <div>
                    <dt className="inline">{t("order.lineValue")}: </dt>
                    <dd className="inline font-medium text-neutral-900">{usd(l.line_value_cents)}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t("order.discount")}: </dt>
                    <dd className="inline font-medium text-neutral-900">
                      {usd(l.discount_cents)} · {formatBasisPointsAsPercent(l.discount_bp_display, locale.intl)}
                    </dd>
                  </div>
                </dl>
                {l.band !== "none" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <BandBadge band={l.band} label={bandLabel(l.band, thresholds)} />
                    {l.approval_status === "approved" && l.approved_at && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                        <IconShieldCheck size={14} />
                        {l.approved_by_name
                          ? t("approval.approved", { name: l.approved_by_name, date: formatDateTime(l.approved_at) })
                          : t("approval.approvedNoName", { date: formatDateTime(l.approved_at) })}
                      </span>
                    )}
                    {l.approval_status === "pending" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        <IconClock size={14} />
                        {t("approval.pending")}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Summary */}
        <Card className="lg:sticky lg:top-32">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("orderView.summary")}</h2>
          <dl className="tabular space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t("order.subtotal")}</dt>
              <dd>{usd(order.subtotal_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t("order.totalDiscount")}</dt>
              <dd className="text-red-700">− {usd(order.discount_cents)}</dd>
            </div>
            <div className="flex justify-between border-t border-black/5 pt-1.5 font-bold">
              <dt>{t("order.totalUsd")}</dt>
              <dd>{usd(order.total_cents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">{t("orderView.rate")}</dt>
              <dd>{t("orderView.rateValue", { rate: formatInteger(order.rate, locale.intl) })}</dd>
            </div>
            <div className="flex justify-between text-base font-extrabold text-brand-800">
              <dt>{t("order.totalSdg")}</dt>
              <dd>{formatSdg(order.total_sdg_piastres, locale.intl)}</dd>
            </div>
            {order.confirmed_at && (
              <div className="flex justify-between pt-1.5 text-xs text-neutral-500">
                <dt>{t("orderView.confirmedAt")}</dt>
                <dd>{formatDateTime(order.confirmed_at)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
            <p className="flex gap-1.5 font-medium text-neutral-800">
              <IconCheck size={14} className="mt-px shrink-0 text-brand-600" />
              {t("orderView.snapshotNote")}
            </p>
            <p>
              {t("orderView.rulesAtSave", {
                sand: formatBasisPointsAsPercent(order.discount_sand_max_bp, locale.intl),
                red: formatBasisPointsAsPercent(order.discount_red_max_bp, locale.intl),
              })}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
