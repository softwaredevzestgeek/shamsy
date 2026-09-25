import { t } from "@/i18n";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { ConfigMissing } from "@/components/ConfigMissing";
import { SunLogo } from "@/components/icons";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams; // also keeps this page dynamic (env is read at request time)
  if (!getSupabasePublicEnv()) return <ConfigMissing />;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 px-6 pb-16 pt-10 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute -end-24 -top-24 size-72 rounded-full bg-sun-400/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -start-20 size-80 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <SunLogo size={40} />
          <span className="text-xl font-bold tracking-tight">{t("app.name")}</span>
        </div>
        <div className="relative mt-8 max-w-md lg:mt-0">
          <h2 className="text-2xl font-bold leading-tight tracking-tight lg:text-4xl">{t("login.heroTitle")}</h2>
          <p className="mt-3 text-sm text-white/70 lg:text-base">{t("login.heroPoints")}</p>
        </div>
      </section>

      {/* Form */}
      <section className="-mt-8 flex items-start justify-center px-4 pb-10 lg:mt-0 lg:items-center">
        <div className="w-full max-w-sm animate-rise rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <h1 className="text-2xl font-bold tracking-tight">{t("login.welcome")}</h1>
          <p className="mb-6 mt-1 text-sm text-neutral-600">{t("login.subtitle")}</p>
          <LoginForm next={target} />
        </div>
      </section>
    </main>
  );
}
