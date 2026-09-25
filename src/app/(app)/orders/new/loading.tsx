import { HeaderSkeleton, OrderFormSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-5">
      <HeaderSkeleton />
      <OrderFormSkeleton />
    </div>
  );
}
