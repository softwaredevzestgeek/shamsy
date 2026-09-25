export interface PendingLine {
  id: string;
  line_no: number;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_value_cents: number;
  discount_cents: number;
  line_total_cents: number;
  discount_bp_display: number;
  order: {
    id: string;
    order_number: number;
    created_at: string;
    rate: number;
    customer: { name: string; city: string } | null;
    creator: { full_name: string } | null;
  } | null;
}
