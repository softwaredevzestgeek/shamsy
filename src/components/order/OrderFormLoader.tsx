"use client";

import dynamic from "next/dynamic";
import { OrderFormSkeleton } from "@/components/skeletons";
import type { OrderFormProps } from "./OrderForm";

// Client-only: the form reads the saved draft from localStorage on first render.
const OrderForm = dynamic(() => import("./OrderForm").then((m) => m.OrderForm), {
  ssr: false,
  loading: () => <OrderFormSkeleton />,
});

export function OrderFormLoader(props: OrderFormProps) {
  return <OrderForm {...props} />;
}
