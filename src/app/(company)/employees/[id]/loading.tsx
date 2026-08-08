import { Skeleton } from "@/components/ui/skeleton";

export default function EmployeeProfileLoading() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-32" />
      <div className="rounded-xl border border-border bg-white px-6 py-5">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
        <div className="mt-4 flex gap-4 border-t border-border pt-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
