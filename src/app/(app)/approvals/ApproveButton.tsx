"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { describeServerError, isNetworkError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { Notice, buttonPrimary } from "@/components/ui";

export function ApproveButton({ lineId }: { lineId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function approve() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("busy");
    setError(null);
    const { error: rpcError } = await createClient().rpc("approve_order_line", { p_line_id: lineId });
    inFlight.current = false;
    if (rpcError) {
      setState("idle");
      setError(isNetworkError(rpcError) ? t("errors.network") : describeServerError(rpcError));
      return;
    }
    setState("done");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button type="button" className={`${buttonPrimary} w-full`} disabled={state !== "idle"} onClick={() => void approve()}>
        {state === "busy" ? t("approvals.approving") : state === "done" ? t("approvals.approved") : t("approvals.approve")}
      </button>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
    </div>
  );
}
