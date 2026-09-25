import { t } from "@/i18n";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice, PageHeader } from "@/components/ui";
import { ApprovalsList } from "./ApprovalsList";
import type { PendingLine } from "./types";

export default async function ApprovalsPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_lines")
    .select(
      "id, line_no, product_name, quantity, unit_price_cents, line_value_cents, discount_cents, line_total_cents, discount_bp_display, " +
        "order:orders!inner(id, order_number, created_at, rate, status, customer:customers(name, city), creator:profiles(full_name))",
    )
    .eq("approval_status", "pending")
    .eq("order.status", "pending_approval")
    .returns<PendingLine[]>();

  // Oldest request first (ISO timestamps sort as strings).
  const lines = (data ?? []).sort(
    (a, b) => (a.order?.created_at ?? "").localeCompare(b.order?.created_at ?? "") || a.line_no - b.line_no,
  );

  return (
    <div className="space-y-5">
      <PageHeader title={t("approvals.title")} subtitle={t("approvals.intro")} />
      {error && <Notice tone="error" role="alert">{t("errors.unknown", { message: error.message })}</Notice>}
      <ApprovalsList lines={lines} />
    </div>
  );
}
