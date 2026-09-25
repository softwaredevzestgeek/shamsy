import type { ReactNode } from "react";
import { t } from "@/i18n";
import type { Band } from "@/lib/money";
import type { OrderStatus } from "@/lib/types";
import { IconAlert, IconCheck, IconClock } from "./icons";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const inputClass =
  "block w-full min-h-12 rounded-xl border border-neutral-300 bg-white px-3.5 text-base shadow-sm transition " +
  "placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 " +
  "disabled:bg-neutral-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/15";

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition " +
  "active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-4";

export const buttonPrimary =
  `${buttonBase} bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-600 ` +
  "focus-visible:ring-brand-500/30 disabled:bg-neutral-300 disabled:text-neutral-600 disabled:shadow-none";

export const buttonSecondary =
  `${buttonBase} border border-neutral-300 bg-white font-medium text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50 ` +
  "focus-visible:ring-brand-500/20 disabled:opacity-60";

export const buttonWarning =
  `${buttonBase} bg-red-700 text-white shadow-sm shadow-red-900/20 hover:bg-red-800 focus-visible:ring-red-500/30 ` +
  "disabled:bg-neutral-300 disabled:text-neutral-600 disabled:shadow-none";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-black/5 bg-white p-4 shadow-sm shadow-black/[0.03]", className)}>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-neutral-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Kept for simple pages. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{children}</h1>;
}

export function SectionTitle({ step, children }: { step?: number; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-900">
      {step !== undefined && (
        <span className="grid size-6 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">{step}</span>
      )}
      {children}
    </h2>
  );
}

export function Notice({
  tone = "info",
  children,
  role,
  icon,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  role?: "status" | "alert";
  icon?: ReactNode;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    error: "border-red-200 bg-red-50 text-red-950",
  };
  const defaultIcon = tone === "success" ? <IconCheck size={18} /> : tone === "info" ? <IconClock size={18} /> : <IconAlert size={18} />;
  return (
    <div role={role} className={cx("flex animate-rise gap-2.5 rounded-xl border px-3 py-2.5 text-sm", tones[tone])}>
      <span className="mt-px shrink-0 opacity-80">{icon ?? defaultIcon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const confirmed = status === "confirmed";
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        confirmed ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
      )}
    >
      {confirmed ? <IconCheck size={13} strokeWidth={3} /> : <IconClock size={13} strokeWidth={2.5} />}
      {t(`status.${status}`)}
    </span>
  );
}

export const bandCardClass: Record<Band, string> = {
  none: "border-black/5 bg-white",
  sand: "border-sand-300 bg-sand-50",
  red: "border-red-300 bg-red-50",
  blocked: "border-red-700 border-2 band-blocked",
};

/** Accent strip on the start edge of a line card. */
export const bandStripClass: Record<Band, string> = {
  none: "bg-neutral-200",
  sand: "bg-sand-500",
  red: "bg-red-500",
  blocked: "bg-red-800",
};

const bandBadgeClass: Record<Band, string> = {
  none: "bg-neutral-100 text-neutral-700",
  sand: "bg-sand-100 text-sand-900 ring-1 ring-sand-500/60",
  red: "bg-red-100 text-red-900 ring-1 ring-red-500/60",
  blocked: "bg-red-800 text-white",
};

const bandIcon: Record<Band, string> = { none: "", sand: "●", red: "▲", blocked: "⛔" };

/** Band label: icon + text, never colour alone. */
export function BandBadge({ band, label }: { band: Band; label: string }) {
  return (
    <span
      key={band}
      className={cx("inline-flex animate-pop items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", bandBadgeClass[band])}
    >
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

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const avatarTones = [
  "bg-brand-100 text-brand-700",
  "bg-sun-300/40 text-sun-600",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
];

/** `tone` replaces the name-derived colours (background + text) entirely. */
export function Avatar({ name, className, tone }: { name: string; className?: string; tone?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors",
        tone ?? avatarTones[hash % avatarTones.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, tone = "default", icon }: { label: string; value: ReactNode; tone?: "default" | "warning" | "brand"; icon?: ReactNode }) {
  const tones = {
    default: "bg-white text-neutral-900",
    warning: "bg-amber-50 text-amber-950 border-amber-200",
    brand: "bg-brand-700 text-white border-brand-800",
  };
  return (
    <div className={cx("min-w-0 rounded-2xl border border-black/5 p-3 shadow-sm", tones[tone])}>
      <div className={cx("flex items-start gap-1.5 text-[11px] font-medium leading-tight sm:text-xs", tone === "brand" ? "text-white/75" : "text-neutral-600")}>
        <span className="mt-px hidden shrink-0 sm:inline">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="tabular mt-1 truncate text-base font-bold sm:text-lg">{value}</div>
    </div>
  );
}

export function EmptyState({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">{icon}</span>
      <p className="text-neutral-700">{title}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}
