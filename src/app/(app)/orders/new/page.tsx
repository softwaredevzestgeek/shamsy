import { t } from "@/i18n";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Product, Settings } from "@/lib/types";
import { Notice, PageTitle } from "@/components/ui";
import { OrderFormLoader } from "@/components/order/OrderFormLoader";

export default async function NewOrderPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [products, customers, settings] = await Promise.all([
    supabase.from("products").select("id, sku, name, price_cents").eq("active", true).order("name").returns<Product[]>(),
    supabase.from("customers").select("id, name, city").order("name").returns<Customer[]>(),
    supabase
      .from("settings")
      .select("min_rate, default_rate, discount_sand_max_bp, discount_red_max_bp, updated_at")
      .maybeSingle<Settings>(),
  ]);

  const error = products.error ?? customers.error ?? settings.error;
  if (error || !settings.data) {
    return (
      <Notice tone="error" role="alert">
        {error ? t("errors.unknown", { message: error.message }) : t("errors.settings_missing")}
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle>{t("order.newTitle")}</PageTitle>
      <OrderFormLoader
        userId={profile.id}
        role={profile.role}
        products={products.data ?? []}
        customers={customers.data ?? []}
        settings={settings.data}
      />
    </div>
  );
}
