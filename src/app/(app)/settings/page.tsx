import { formatDateTime, t } from "@/i18n";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Settings } from "@/lib/types";
import { Notice, PageTitle } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .select("min_rate, default_rate, discount_sand_max_bp, discount_red_max_bp, updated_at")
    .maybeSingle<Settings>();

  return (
    <div className="space-y-4">
      <PageTitle>{t("settings.title")}</PageTitle>
      <p className="text-sm text-neutral-700">{t("settings.intro")}</p>
      {error && <Notice tone="error" role="alert">{t("errors.unknown", { message: error.message })}</Notice>}
      {!error && !data && <Notice tone="error" role="alert">{t("errors.settings_missing")}</Notice>}
      {data && (
        <>
          <SettingsForm settings={data} />
          <p className="text-xs text-neutral-500">{t("settings.lastUpdated", { date: formatDateTime(data.updated_at) })}</p>
        </>
      )}
    </div>
  );
}
