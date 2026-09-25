import { t } from "@/i18n";
import { locale } from "@/i18n";
import { formatBasisPointsAsPercent, type Band, type DiscountThresholds } from "./money";

export function bandLabel(band: Band, thresholds: DiscountThresholds): string {
  const sand = formatBasisPointsAsPercent(thresholds.sandMaxBp, locale.intl);
  const red = formatBasisPointsAsPercent(thresholds.redMaxBp, locale.intl);
  switch (band) {
    case "none":
      return t("band.none");
    case "sand":
      return t("band.sand", { max: sand });
    case "red":
      return t("band.red", { min: sand, max: red });
    case "blocked":
      return t("band.blocked", { max: red });
  }
}
