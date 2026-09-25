"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { IconSpinner } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: ReactNode;
}

function PendingHint() {
  const { pending } = useLinkStatus();
  // Always rendered, only opacity changes: no layout shift.
  return (
    <span aria-hidden className={cx("transition-opacity", pending ? "opacity-100" : "opacity-0")}>
      <IconSpinner size={14} />
    </span>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/orders") return pathname === "/orders" || (/^\/orders\/[^/]+$/.test(pathname) && pathname !== "/orders/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mb-px overflow-x-auto [scrollbar-width:none]">
      <ul className="flex sm:gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-t-lg px-1 text-[13px] font-medium transition-colors sm:inline-flex sm:w-auto sm:px-3 sm:text-sm",
                  active ? "text-white" : "text-white/70 hover:text-white",
                )}
              >
                <span className="hidden sm:inline-flex">{item.icon}</span>
                {item.label}
                {item.badge}
                <PendingHint />
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-sun-400 transition-all duration-300",
                    active ? "opacity-100" : "scale-x-0 opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
