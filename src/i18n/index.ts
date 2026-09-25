import en from "./en.json";

/**
 * Minimal i18n. Every UI string lives in a JSON file per language; components
 * call t("section.key", { var }) and never contain literal text.
 * Adding Arabic = add ar.json, set `dir: "rtl"` and an Arabic Intl locale.
 */
type Messages = typeof en;

type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type Vars = Record<string, string | number>;

export const locale = {
  code: "en",
  /** BCP 47 locale for Intl number and date formatting. */
  intl: "en-US",
  dir: "ltr" as "ltr" | "rtl",
  /** Business time zone for dates. */
  timeZone: "Africa/Khartoum",
};

const messages: Messages = en;

function lookup(key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function t(key: MessageKey, vars?: Vars): string {
  return interpolate(lookup(key) ?? key, vars);
}

export function hasMessage(key: string): key is MessageKey {
  return lookup(key) !== undefined;
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(locale.intl, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: locale.timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}
