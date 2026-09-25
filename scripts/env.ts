import { config } from "dotenv";

// Same precedence as Next.js: .env.local overrides .env
config({ path: [".env.local", ".env"], quiet: true });

export function need(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key];
    if (value) return value;
  }
  console.error(`Missing env var ${[name, ...fallbacks].join(" or ")}. See .env.example.`);
  process.exit(2);
}

export const SUPABASE_URL = () => need("NEXT_PUBLIC_SUPABASE_URL");
export const PUBLIC_KEY = () => need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SERVICE_KEY = () => need("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");

export const USERS = {
  adviser: { email: "adviser@shamsy.test", fullName: "Demo Adviser", role: "adviser" as const, passwordVar: "SEED_ADVISER_PASSWORD" },
  owner: { email: "owner@shamsy.test", fullName: "Demo Owner", role: "owner" as const, passwordVar: "SEED_OWNER_PASSWORD" },
};
