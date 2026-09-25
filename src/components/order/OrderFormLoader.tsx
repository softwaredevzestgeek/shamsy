"use client";

import dynamic from "next/dynamic";
import { t } from "@/i18n";
import type { OrderFormProps } from "./OrderForm";

// Client-only: the form reads the saved draft from localStorage on first render.
const OrderForm = dynamic(() => import("./OrderForm").then((m) => m.OrderForm), {
  ssr: false,
  loading: () => <p className="py-8 text-center text-neutral-600">{t("order.loading")}</p>,
});

export function OrderFormLoader(props: OrderFormProps) {
  return <OrderForm {...props} />;
}
