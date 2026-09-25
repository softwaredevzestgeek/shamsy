"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { createClient } from "@/lib/supabase/client";
import { Notice, buttonPrimary, inputClass } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (authError) {
        setError(authError.status && authError.status < 500 ? t("login.failed") : t("login.network"));
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError(t("login.network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">{t("login.email")}</label>
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">{t("login.password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? t("login.submitting") : t("login.submit")}
      </button>
    </form>
  );
}
