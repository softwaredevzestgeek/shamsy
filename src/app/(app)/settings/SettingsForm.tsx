"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { describeServerError, isNetworkError } from "@/lib/errors";
import { centsToInputString, parseDollarsToCents, parseWholeNumber } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { BandBadge, Card, Notice, SectionTitle, buttonPrimary, cx, inputClass } from "@/components/ui";
import { IconSpinner } from "@/components/icons";
import { bandLabel } from "@/lib/band-label";

// A percentage with two decimals is parsed exactly like dollars with cents:
// "3" -> 300 bp, "2.5" -> 250 bp. String parsing, no floats.
const parsePercentToBp = parseDollarsToCents;

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [values, setValues] = useState({
    minRate: String(settings.min_rate),
    defaultRate: String(settings.default_rate),
    sand: centsToInputString(settings.discount_sand_max_bp),
    red: centsToInputString(settings.discount_red_max_bp),
  });
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const minRate = parseWholeNumber(values.minRate);
  const defaultRate = parseWholeNumber(values.defaultRate);
  const sand = parsePercentToBp(values.sand);
  const red = parsePercentToBp(values.red);

  const errors = {
    minRate: !minRate.ok || minRate.value < 1 ? t("settings.invalidNumber") : null,
    defaultRate:
      !defaultRate.ok || defaultRate.value < 1
        ? t("settings.invalidNumber")
        : minRate.ok && defaultRate.value < minRate.value
          ? t("settings.defaultBelowMin")
          : null,
    sand: !sand.ok || sand.value > 10_000 ? t("settings.invalidPercent") : null,
    red:
      !red.ok || red.value > 10_000
        ? t("settings.invalidPercent")
        : sand.ok && red.value < sand.value
          ? t("settings.bandsOrder")
          : null,
  };
  const valid = !errors.minRate && !errors.defaultRate && !errors.sand && !errors.red;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid || inFlight.current || !minRate.ok || !defaultRate.ok || !sand.ok || !red.ok) return;
    inFlight.current = true;
    setSaving(true);
    setMessage(null);
    const { error } = await createClient().rpc("update_settings", {
      p_min_rate: minRate.value,
      p_default_rate: defaultRate.value,
      p_discount_sand_max_bp: sand.value,
      p_discount_red_max_bp: red.value,
    });
    inFlight.current = false;
    setSaving(false);
    if (error) {
      setMessage({ tone: "error", text: isNetworkError(error) ? t("errors.network") : describeServerError(error) });
      return;
    }
    setMessage({ tone: "success", text: t("settings.saved") });
    router.refresh();
  }

  const field = (key: keyof typeof values, label: string, inputMode: "numeric" | "decimal", hint?: string, suffix?: string) => (
    <div>
      <label htmlFor={key} className="mb-1 block text-sm font-medium text-neutral-700">{label}</label>
      <div className="relative">
      <input
        id={key}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        className={cx(inputClass, "tabular font-semibold", suffix && "pe-12")}
        value={values[key]}
        aria-invalid={Boolean(errors[key])}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
      {suffix && <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3.5 grid place-items-center text-sm text-neutral-500">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
      {errors[key] && <p className="mt-1 text-sm text-red-700">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <SectionTitle>{t("settings.ratesTitle")}</SectionTitle>
        {field("minRate", t("settings.minRate"), "numeric")}
        {field("defaultRate", t("settings.defaultRate"), "numeric")}
      </Card>
      <Card className="space-y-4">
        <SectionTitle>{t("settings.bandsTitle")}</SectionTitle>
        {field("sand", t("settings.sandMax"), "decimal", undefined, "%")}
        {field("red", t("settings.redMax"), "decimal", t("settings.bandsHint"), "%")}
        {sand.ok && red.ok && !errors.sand && !errors.red && (
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-neutral-50 p-2.5">
            <span className="sr-only">{t("settings.preview")}</span>
            {(["sand", "red", "blocked"] as const).map((b) => (
              <BandBadge key={b} band={b} label={bandLabel(b, { sandMaxBp: sand.value, redMaxBp: red.value })} />
            ))}
          </div>
        )}
      </Card>
      <div className="space-y-3 lg:col-span-2">
      {message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}
      <button type="submit" className={cx(buttonPrimary, "w-full sm:w-auto")} disabled={!valid || saving}>
        {saving && <IconSpinner />}
        {saving ? t("settings.saving") : t("settings.save")}
      </button>
      </div>
    </form>
  );
}
