import { t } from "@/i18n";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { ConfigMissing } from "@/components/ConfigMissing";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams; // also keeps this page dynamic (env is read at request time)
  if (!getSupabasePublicEnv()) return <ConfigMissing />;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{t("app.name")}</p>
      <h1 className="mb-6 text-2xl font-bold">{t("login.title")}</h1>
      <LoginForm next={target} />
    </main>
  );
}
