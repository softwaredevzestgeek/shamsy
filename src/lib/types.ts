import type { Band } from "./money";

export type Role = "owner" | "adviser";
export type OrderStatus = "pending_approval" | "confirmed";
export type ApprovalStatus = "not_required" | "pending" | "approved";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: Role;
}

export interface Settings {
  min_rate: number;
  default_rate: number;
  discount_sand_max_bp: number;
  discount_red_max_bp: number;
  updated_at: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price_cents: number;
}

export interface Customer {
  id: string;
  name: string;
  city: string;
}

/** Stored order, read back exactly as saved. SDG piastres come as text (bigint-safe). */
export interface OrderRow {
  id: string;
  order_number: number;
  created_at: string;
  confirmed_at: string | null;
  status: OrderStatus;
  rate: number;
  discount_sand_max_bp: number;
  discount_red_max_bp: number;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  total_sdg_piastres: string;
  customer: { name: string; city: string } | null;
  creator: { full_name: string } | null;
}

export interface OrderLineRow {
  id: string;
  line_no: number;
  product_sku: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_value_cents: number;
  discount_cents: number;
  line_total_cents: number;
  discount_bp_display: number;
  band: Band;
  approval_status: ApprovalStatus;
  approved_by_name: string | null;
  approved_at: string | null;
}

/** Column list for reading an order header; piastres cast to text so bigint never becomes a lossy JS number. */
export const ORDER_COLUMNS =
  "id, order_number, created_at, confirmed_at, status, rate, discount_sand_max_bp, discount_red_max_bp, " +
  "subtotal_cents, discount_cents, total_cents, total_sdg_piastres::text, " +
  "customer:customers(name, city), creator:profiles(full_name)";

export const ORDER_LINE_COLUMNS =
  "id, line_no, product_sku, product_name, unit_price_cents, quantity, line_value_cents, discount_cents, " +
  "line_total_cents, discount_bp_display, band, approval_status, approved_by_name, approved_at";
