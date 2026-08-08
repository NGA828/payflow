import { Skeleton } from "@/components/ui/skeleton";

export default function EmployeesLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="h-[38px] w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex items-center gap-2.5 border-b border-border bg-canvas/70 px-4 py-3">
          <Skeleton className="h-[38px] flex-1" />
          <Skeleton className="h-[38px] w-[150px]" />
          <Skeleton className="h-[38px] w-[180px]" />
        </div>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 last:border-0">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
