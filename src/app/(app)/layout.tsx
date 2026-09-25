import type { ReactNode } from "react";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { requireProfile } from "@/lib/auth";
import { ConfigMissing } from "@/components/ConfigMissing";
import { Header } from "@/components/Header";
import { t } from "@/i18n";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!getSupabasePublicEnv()) return <ConfigMissing />;
  const profile = await requireProfile();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:bg-white focus:p-2">
        {t("app.skipToContent")}
      </a>
      <Header profile={profile} />
      <main id="main" className="mx-auto w-full max-w-2xl px-3 pb-40 pt-4 sm:px-4">
        {children}
      </main>
    </>
  );
}
