import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** When true, render bare (no Card wrapper) — useful inside an existing Card. */
  bare?: boolean;
}

/**
 * Mandatory empty-state pattern for every list/table.
 * Always: icon (48px) → title → optional description → optional CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  bare = false,
}: EmptyStateProps) {
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-10 text-center",
        className,
      )}
      dir="rtl"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );

  if (bare) return inner;
  return <Card className="overflow-hidden">{inner}</Card>;
}
