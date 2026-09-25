import { Card, Skeleton } from "./ui";

export function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64 max-w-[60vw]" />
      </div>
      {action && <Skeleton className="hidden h-12 w-32 rounded-xl sm:block" />}
    </div>
  );
}

export function OrdersListSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <HeaderSkeleton action />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-2xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <div className="space-y-2">
              <Skeleton className="ms-auto h-4 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderFormSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6" aria-busy="true">
      <div className="space-y-5">
        <Card>
          <Skeleton className="mb-3 h-5 w-24" />
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="mb-3 h-5 w-28" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="mb-3 h-5 w-32" />
          <Skeleton className="h-14 rounded-xl" />
        </Card>
      </div>
      <Skeleton className="hidden h-96 rounded-2xl lg:block" />
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <HeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
