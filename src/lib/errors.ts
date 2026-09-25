import { hasMessage, t } from "@/i18n";
import { formatInteger } from "./money";
import { locale } from "@/i18n";

/** Shape shared by PostgrestError and similar. */
export interface ServerError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * PostgREST answers with an SQLSTATE code. A fetch that never reached the
 * server (dropped 3G, offline, aborted) has no code.
 */
export function isNetworkError(error: ServerError | null | undefined): boolean {
  if (!error) return false;
  if (!error.code) return true;
  return /Failed to fetch|NetworkError|Load failed|network|AbortError|aborted/i.test(error.message);
}

/** Map a database error (raised as a stable snake_case code) to a translated sentence. */
export function describeServerError(error: ServerError): string {
  const code = error.message.trim();
  const key = `errors.${code}`;
  if (hasMessage(key)) {
    const vars: Record<string, string> = { line: error.details ?? "" };
    if (code === "rate_below_minimum" && error.details && /^\d+$/.test(error.details)) {
      vars.min = formatInteger(error.details, locale.intl);
    }
    return t(key, vars);
  }
  if (error.code === "42501") return t("errors.permission_denied");
  return t("errors.unknown", { message: error.message });
}
