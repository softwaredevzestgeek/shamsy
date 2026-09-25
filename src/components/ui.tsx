import type { ReactNode } from "react";
import { t } from "@/i18n";
import type { Band } from "@/lib/money";
import type { OrderStatus } from "@/lib/types";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const inputClass =
  "block w-full min-h-12 rounded-lg border border-neutral-300 bg-white px-3 text-base " +
  "focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/30 " +
  "disabled:bg-neutral-100 aria-[invalid=true]:border-red-600";

export const buttonPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-brand-700 px-5 text-base font-semibold text-white " +
  "hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-neutral-400";

export const buttonSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-base font-medium " +
  "text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";

export const buttonWarning =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-red-800 px-5 text-base font-semibold text-white " +
  "hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-neutral-400";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-neutral-200 bg-white p-4", className)}>{children}</section>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-xl font-bold text-neutral-900">{children}</h1>;
}

export function Notice({
  tone = "info",
  children,
  role,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  role?: "status" | "alert";
}) {
  const tones = {
    info: "border-sky-300 bg-sky-50 text-sky-900",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-900",
  };
  return (
    <div role={role} className={cx("rounded-lg border px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "confirmed" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
      )}
    >
      <span aria-hidden>{status === "confirmed" ? "✓" : "⏳"}</span>
      {t(`status.${status}`)}
    </span>
  );
}

export const bandCardClass: Record<Band, string> = {
  none: "border-neutral-200 bg-white",
  sand: "border-sand-500 bg-sand-50",
  red: "border-red-500 bg-red-50",
  blocked: "border-red-800 border-2 band-blocked",
};

const bandBadgeClass: Record<Band, string> = {
  none: "bg-neutral-100 text-neutral-700",
  sand: "bg-sand-100 text-sand-900 ring-1 ring-sand-500",
  red: "bg-red-100 text-red-900 ring-1 ring-red-500",
  blocked: "bg-red-800 text-white",
};

const bandIcon: Record<Band, string> = { none: "", sand: "●", red: "▲", blocked: "⛔" };

/** Band label: icon + text, never colour alone. */
export function BandBadge({ band, label }: { band: Band; label: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", bandBadgeClass[band])}>
      {bandIcon[band] && <span aria-hidden>{bandIcon[band]}</span>}
      {label}
    </span>
  );
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3", strong && "text-base font-bold")}>
      <dt className={cx(strong ? "text-neutral-900" : "text-neutral-600", "text-sm")}>{label}</dt>
      <dd className="tabular text-end">{value}</dd>
    </div>
  );
}
