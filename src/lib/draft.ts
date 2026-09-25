/**
 * The in-progress order lives in localStorage so a dropped connection, a
 * reload or a closed tab never loses the adviser's entry. It is keyed per
 * user and carries the idempotency key (client_request_id) for the save.
 */
export interface DraftLine {
  key: string;
  productId: string;
  quantity: string;
  discount: string;
}

export interface OrderDraft {
  v: 1;
  clientRequestId: string;
  customerId: string;
  rate: string;
  lines: DraftLine[];
  updatedAt: string;
}

const PREFIX = "shamsy:order-draft:v1:";

export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 from getRandomValues (older browsers / non-secure contexts)
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newLine(productId = ""): DraftLine {
  return { key: uuid(), productId, quantity: "1", discount: "" };
}

export function newDraft(defaultRate: number): OrderDraft {
  return {
    v: 1,
    clientRequestId: uuid(),
    customerId: "",
    rate: String(defaultRate),
    lines: [],
    updatedAt: new Date().toISOString(),
  };
}

function isDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<OrderDraft>;
  return (
    d.v === 1 &&
    typeof d.clientRequestId === "string" &&
    typeof d.customerId === "string" &&
    typeof d.rate === "string" &&
    Array.isArray(d.lines) &&
    d.lines.every(
      (l) =>
        l && typeof l.key === "string" && typeof l.productId === "string" &&
        typeof l.quantity === "string" && typeof l.discount === "string",
    )
  );
}

export function loadDraft(userId: string): OrderDraft | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: OrderDraft): boolean {
  try {
    window.localStorage.setItem(PREFIX + userId, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(userId: string): void {
  try {
    window.localStorage.removeItem(PREFIX + userId);
  } catch {
    // storage unavailable: nothing to clear
  }
}

/** A draft is worth restoring only if the adviser typed something. */
export function isDraftEmpty(draft: OrderDraft): boolean {
  return (
    draft.customerId === "" &&
    draft.lines.every((l) => l.productId === "" && l.discount === "")
  );
}
