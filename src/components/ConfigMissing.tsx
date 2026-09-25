import { t } from "@/i18n";
import { Notice } from "./ui";

export function ConfigMissing() {
  return (
    <main className="mx-auto max-w-md p-4">
      <Notice tone="error" role="alert">
        <p className="font-semibold">{t("config.missingTitle")}</p>
        <p>{t("config.missingBody")}</p>
      </Notice>
    </main>
  );
}
