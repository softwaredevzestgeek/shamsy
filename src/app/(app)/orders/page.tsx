import Link from "next/link";
import { formatDateTime, locale, t } from "@/i18n";
import { requireProfile } from "@/lib/auth";
import { formatSdg, formatUsd, sumCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { ORDER_COLUMNS, type OrderRow } from "@/lib/types";
import { Avatar, EmptyState, Notice, PageHeader, Stat, StatusBadge, buttonPrimary, cx } from "@/components/ui";
import { IconCheck, IconChevron, IconClock, IconList, IconPlus } from "@/components/icons";

type Filter = "all" | "pending_approval" | "confirmed";

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const { status } = await searchParams;
  const filter: Filter = status === "pending_approval" || status === "confirmed" ? status : "all";
  const profile = await requireProfile();
  const supabase = await createClient();
  // RLS limits an adviser to her own orders; the owner sees all.
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<OrderRow[]>();

  const orders = data ?? [];
  const pending = orders.filter((o) => o.status === "pending_approval").length;
  const confirmedUsd = sumCents(orders.filter((o) => o.status === "confirmed").map((o) => o.total_cents));
  const shown = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const chips: Array<{ value: Filter; label: string; count: number }> = [
    { value: "all", label: t("orders.filterAll"), count: orders.length },
    { value: "pending_approval", label: t("orders.filterPending"), count: pending },
    { value: "confirmed", label: t("orders.filterConfirmed"), count: orders.length - pending },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("orders.title")}
        subtitle={t("orders.subtitle")}
        action={
          <div className="hidden sm:block">
            <Link href="/orders/new" className={buttonPrimary}>
              <IconPlus size={18} />
              {t("orders.newOrder")}
            </Link>
          </div>
        }
      />

      {error && <Notice tone="error" role="alert">{t("orders.loadFailed", { message: error.message })}</Notice>}

      {orders.length > 0 && (
        <div className="stagger grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label={t("orders.statTotal")} value={orders.length} icon={<IconList size={14} />} />
          <Stat label={t("orders.statPending")} value={pending} tone={pending ? "warning" : "default"} icon={<IconClock size={14} />} />
          <Stat label={t("orders.statConfirmedUsd")} value={formatUsd(confirmedUsd, locale.intl)} tone="brand" icon={<IconCheck size={14} />} />
        </div>
      )}

      {!error && orders.length === 0 && (
        <EmptyState
          icon={<IconList size={22} />}
          title={t("orders.empty")}
          action={
            <Link href="/orders/new" className={buttonPrimary}>
              <IconPlus size={18} />
              {t("orders.newOrder")}
            </Link>
          }
        />
      )}

      {orders.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="hidden text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:block">{t("orders.recent")}</h2>
            <nav aria-label={t("orders.filterLabel")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]">
              {chips.map((c) => {
                const active = c.value === filter;
                return (
                  <Link
                    key={c.value}
                    href={c.value === "all" ? "/orders" : `/orders?status=${c.value}`}
                    scroll={false}
                    replace
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition active:scale-95",
                      active ? "border-brand-700 bg-brand-700 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300",
                    )}
                  >
                    {c.label}
                    <span className={cx("tabular rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-neutral-100 text-neutral-600")}>{c.count}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          {shown.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-600">{t("orders.emptyFiltered")}</p>}
          <ul aria-label={t("orders.listLabel")} className="stagger space-y-2">
            {shown.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-black/5 bg-white p-3 ps-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
                >
                  <span
                    aria-hidden
                    className={cx("absolute inset-y-0 start-0 w-1", o.status === "confirmed" ? "bg-emerald-500" : "bg-amber-400")}
                  />
                  <Avatar name={o.customer?.name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">{o.customer?.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      <span className="tabular">#{o.order_number}</span> · {formatDateTime(o.created_at)}
                      {profile.role === "owner" && o.creator?.full_name ? ` · ${o.creator.full_name}` : ""}
                    </p>
                    <div className="mt-1.5 sm:hidden">
                      <StatusBadge status={o.status} />
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="tabular shrink-0 text-end">
                    <p className="font-bold text-neutral-900">{formatUsd(o.total_cents, locale.intl)}</p>
                    <p className="text-xs text-neutral-500">{formatSdg(o.total_sdg_piastres, locale.intl)}</p>
                  </div>
                  <IconChevron size={18} className="hidden shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500 sm:block rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Floating action button on phones */}
      <Link
        href="/orders/new"
        aria-label={t("orders.newOrder")}
        className="fixed bottom-6 end-5 z-20 grid size-14 animate-pop place-items-center rounded-full bg-brand-700 text-white shadow-xl shadow-brand-900/30 transition active:scale-90 sm:hidden"
      >
        <IconPlus size={26} strokeWidth={2.5} />
      </Link>
    </div>
  );
}
