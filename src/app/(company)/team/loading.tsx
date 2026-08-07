import { Skeleton } from "@/components/ui/skeleton";

export default function TeamLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-[38px] w-36 rounded-lg" />
      </div>
      {[0, 1].map((card) => (
        <div key={card} className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: card === 0 ? 3 : 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 last:border-0">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1.5 h-3 w-52" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-[30px] w-[30px] rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
