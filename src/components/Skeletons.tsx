import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shape-matching skeletons used during loading so the page does not collapse
 * into a centered spinner. Keep these dumb and presentational.
 */

export function KpiCardSkeleton() {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-3 w-16" />
    </Card>
  );
}

export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableRowsSkeleton({
  rows = 6,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <ul className="divide-y">
      {Array.from({ length: rows }).map((_, r) => (
        <li key={r} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          {Array.from({ length: Math.max(0, cols - 2) }).map((_, c) => (
            <Skeleton key={c} className="hidden h-4 w-16 md:block" />
          ))}
          <Skeleton className="h-6 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function DashboardBlockSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <Card className="p-4 space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={`w-full ${height}`} />
    </Card>
  );
}
