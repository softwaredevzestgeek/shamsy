import { Suspense } from "react";
import Link from "next/link";
import { t } from "@/i18n";
import { signOut } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { NavLinks, type NavItem } from "./NavLinks";
import { IconList, IconLogout, IconPlus, IconShieldCheck, IconSliders, SunLogo } from "./icons";
import { initials } from "./ui";

/** Streams in after the header: never blocks navigation. */
async function PendingBadge() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pending");
  if (!count) return null;
  return (
    <span className="grid min-w-5 animate-pop place-items-center rounded-full bg-sun-400 px-1.5 text-xs font-bold text-brand-900">
      {count}
    </span>
  );
}

export function Header({ profile }: { profile: Profile }) {
  const isOwner = profile.role === "owner";
  const name = profile.full_name || profile.email || "";

  const items: NavItem[] = [
    { href: "/orders", label: t("nav.orders"), icon: <IconList size={16} /> },
    { href: "/orders/new", label: t("nav.newOrder"), icon: <IconPlus size={16} /> },
    ...(isOwner
      ? [
          {
            href: "/approvals",
            label: t("nav.approvals"),
            icon: <IconShieldCheck size={16} />,
            badge: (
              <Suspense fallback={null}>
                <PendingBadge />
              </Suspense>
            ),
          },
          { href: "/settings", label: t("nav.settings"), icon: <IconSliders size={16} /> },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 bg-gradient-to-b from-brand-800 to-brand-700 text-white shadow-lg shadow-brand-900/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pb-1 pt-3">
        <Link href="/orders" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun-400">
          <SunLogo size={30} />
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">{t("app.name")}</span>
            <span className="block text-[11px] text-white/65">{t("app.tagline")}</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden min-w-0 text-end sm:block">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-white/65">{t(`roles.${profile.role}`)}</p>
          </div>
          <span
            title={`${name} · ${t(`roles.${profile.role}`)}`}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold ring-1 ring-white/25"
          >
            {initials(name)}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              aria-label={t("nav.logout")}
              title={t("nav.logout")}
              className="grid size-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              <IconLogout size={18} className="rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-2 sm:px-3">
        <div className="flex items-center justify-between gap-2">
          <NavLinks items={items} label={t("nav.mainNav")} />
          <span className="me-2 hidden shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80 max-sm:inline">
            {t(`roles.${profile.role}`)}
          </span>
        </div>
      </div>
    </header>
  );
}
