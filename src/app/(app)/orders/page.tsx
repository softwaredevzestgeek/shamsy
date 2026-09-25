import Link from "next/link";
import { formatDateTime, locale, t } from "@/i18n";
import { requireProfile } from "@/lib/auth";
import { formatSdg, formatUsd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ORDER_COLUMNS, type OrderRow } from "@/lib/types";
import { Notice, PageTitle, StatusBadge, buttonPrimary } from "@/components/ui";

export default async function OrdersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // RLS limits an adviser to her own orders; the owner sees all.
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<OrderRow[]>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <PageTitle>{t("orders.title")}</PageTitle>
        <Link href="/orders/new" className={buttonPrimary}>
          {t("orders.newOrder")}
        </Link>
      </div>

      {error && <Notice tone="error" role="alert">{t("orders.loadFailed", { message: error.message })}</Notice>}
      {!error && data?.length === 0 && <p className="text-neutral-600">{t("orders.empty")}</p>}

      <ul aria-label={t("orders.listLabel")} className="space-y-2">
        {data?.map((o) => (
          <li key={o.id}>
            <Link
              href={`/orders/${o.id}`}
              className="block rounded-xl border border-neutral-200 bg-white p-3 hover:border-brand-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{t("orders.number", { number: o.order_number })}</span>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-1 text-sm text-neutral-700">
                {o.customer?.name}
                {o.customer?.city ? ` · ${o.customer.city}` : ""}
              </div>
              <div className="text-xs text-neutral-500">
                {formatDateTime(o.created_at)}
                {profile.role === "owner" && o.creator?.full_name ? ` · ${o.creator.full_name}` : ""}
              </div>
              <div className="tabular mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-end">
                <span className="text-base font-bold">{formatUsd(o.total_cents, locale.intl)}</span>
                <span className="text-sm text-neutral-700">{formatSdg(o.total_sdg_piastres, locale.intl)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
