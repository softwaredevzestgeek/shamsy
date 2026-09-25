import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, key } = requireSupabasePublicEnv();
  browserClient = createBrowserClient(url, key);
  return browserClient;
}
