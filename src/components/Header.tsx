import Link from "next/link";
import { t } from "@/i18n";
import { signOut } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function Header({ profile }: { profile: Profile }) {
  const isOwner = profile.role === "owner";
  let pending = 0;
  if (isOwner) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("order_lines")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending");
    pending = count ?? 0;
  }

  const links = [
    { href: "/orders", label: t("nav.orders") },
    { href: "/orders/new", label: t("nav.newOrder") },
    ...(isOwner
      ? [
          { href: "/approvals", label: t("nav.approvals"), badge: pending },
          { href: "/settings", label: t("nav.settings") },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-20 bg-brand-700 text-white shadow">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{profile.full_name || profile.email}</p>
          <p className="text-xs text-white/80">{t(`roles.${profile.role}`)}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="min-h-11 rounded-lg border border-white/40 px-3 text-sm font-medium hover:bg-white/10">
            {t("nav.logout")}
          </button>
        </form>
      </div>
      <nav aria-label={t("nav.mainNav")} className="mx-auto max-w-2xl overflow-x-auto px-1 sm:px-2">
        <ul className="flex gap-1 pb-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium hover:bg-white/10"
              >
                {l.label}
                {"badge" in l && typeof l.badge === "number" && l.badge > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 text-xs font-bold text-neutral-900">{l.badge}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
