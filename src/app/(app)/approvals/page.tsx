import Link from "next/link";
import { formatDateTime, locale, t } from "@/i18n";
import { requireOwner } from "@/lib/auth";
import { formatBasisPointsAsPercent, formatInteger, formatUsd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { Notice, PageTitle, Row } from "@/components/ui";
import { ApproveButton } from "./ApproveButton";

interface PendingLine {
  id: string;
  line_no: number;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_value_cents: number;
  discount_cents: number;
  line_total_cents: number;
  discount_bp_display: number;
  order: {
    id: string;
    order_number: number;
    created_at: string;
    rate: number;
    customer: { name: string; city: string } | null;
    creator: { full_name: string } | null;
  } | null;
}

export default async function ApprovalsPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_lines")
    .select(
      "id, line_no, product_name, quantity, unit_price_cents, line_value_cents, discount_cents, line_total_cents, discount_bp_display, " +
        "order:orders!inner(id, order_number, created_at, rate, status, customer:customers(name, city), creator:profiles(full_name))",
    )
    .eq("approval_status", "pending")
    .eq("order.status", "pending_approval")
    .returns<PendingLine[]>();
  // Oldest request first (ISO timestamps sort as strings).
  data?.sort((a, b) => (a.order?.created_at ?? "").localeCompare(b.order?.created_at ?? "") || a.line_no - b.line_no);

  const usd = (c: number) => formatUsd(c, locale.intl);

  return (
    <div className="space-y-4">
      <PageTitle>{t("approvals.title")}</PageTitle>
      <p className="text-sm text-neutral-700">{t("approvals.intro")}</p>
      {error && <Notice tone="error" role="alert">{t("errors.unknown", { message: error.message })}</Notice>}
      {!error && data?.length === 0 && <p className="text-neutral-600">{t("approvals.empty")}</p>}
      <ul className="space-y-3">
        {data?.map((l) => (
          <li key={l.id} className="band-blocked rounded-xl border-2 border-red-800 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">
                {t("orders.number", { number: l.order?.order_number ?? "" })} · {t("order.line", { n: l.line_no })}
              </span>
              {l.order && (
                <Link href={`/orders/${l.order.id}`} className="text-sm underline">{t("approvals.openOrder")}</Link>
              )}
            </div>
            <dl className="tabular mt-2 space-y-1 rounded-lg bg-white/85 p-2 text-sm">
              <Row label={t("orderView.dealer")} value={l.order?.customer?.name ?? ""} />
              <Row label={t("approvals.adviser")} value={l.order?.creator?.full_name ?? ""} />
              <Row label={t("orderView.createdAt")} value={l.order ? formatDateTime(l.order.created_at) : ""} />
              <Row label={t("order.product")} value={l.product_name} />
              <Row label={t("order.quantity")} value={t("orderView.qtyTimesPrice", { qty: formatInteger(l.quantity, locale.intl), price: usd(l.unit_price_cents) })} />
              <Row label={t("order.lineValue")} value={usd(l.line_value_cents)} />
              <Row
                label={t("order.discount")}
                value={`${usd(l.discount_cents)} · ${formatBasisPointsAsPercent(l.discount_bp_display, locale.intl)}`}
                strong
              />
              <Row label={t("order.lineTotal")} value={usd(l.line_total_cents)} />
            </dl>
            <div className="mt-3">
              <ApproveButton lineId={l.id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
