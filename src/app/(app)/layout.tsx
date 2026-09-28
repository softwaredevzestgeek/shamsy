import { ViewTransition, type ReactNode } from "react";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { requireProfile } from "@/lib/auth";
import { ConfigMissing } from "@/components/ConfigMissing";
import { Header } from "@/components/Header";
import { t } from "@/i18n";
import { Notice } from "@/components/ui";
import { signOut } from "@/app/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!getSupabasePublicEnv()) return <ConfigMissing />;
  const profile = await requireProfile();
  if (profile.role === "pending") {
    // Signed in but no role yet: the database already returns nothing; say why.
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <Notice tone="warning" role="alert">
          <p className="font-semibold">{t("access.pendingTitle")}</p>
          <p>{t("access.pendingBody")}</p>
        </Notice>
        <form action={signOut}>
          <button type="submit" className="min-h-11 text-sm font-medium underline">{t("nav.logout")}</button>
        </form>
      </main>
    );
  }
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        {t("app.skipToContent")}
      </a>
      <Header profile={profile} />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-44 pt-5 lg:pb-12">
        <ViewTransition default="page-fade">{children}</ViewTransition>
      </main>
    </>
  );
}
