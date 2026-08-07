import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-[38px] w-40 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <Skeleton className="h-3.5 w-56" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 last:border-0">
            <div className="flex-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-1.5 h-3 w-64" />
            </div>
            <Skeleton className="mx-4 h-4 w-8" />
            <Skeleton className="mx-4 h-4 w-8" />
            <Skeleton className="mx-4 h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
