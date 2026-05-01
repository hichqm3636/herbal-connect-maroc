import { Link } from "@tanstack/react-router";
import { Truck, Clock, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface ClientAlert {
  id: string;
  kind: "processing" | "shipped" | "delivered";
  title: string;
  body: string;
  href: string;
}

interface Props {
  alerts: ClientAlert[];
}

const STYLE: Record<
  ClientAlert["kind"],
  { icon: typeof Truck; bg: string; text: string; border: string }
> = {
  processing: {
    icon: Clock,
    bg: "bg-yellow-500/10",
    text: "text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-500/30",
  },
  shipped: {
    icon: Truck,
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-500/30",
  },
  delivered: {
    icon: CheckCircle2,
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/30",
  },
};

export function AlertsBanner({ alerts }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <section dir="rtl" className="space-y-2">
      {visible.map((a) => {
        const s = STYLE[a.kind];
        const Icon = s.icon;
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-start gap-3 rounded-2xl border p-3",
              s.bg,
              s.border,
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/60",
                s.text,
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <Link to={a.href} className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold leading-tight", s.text)}>
                {a.title}
              </p>
              <p className="mt-0.5 truncate text-xs text-foreground/70">
                {a.body}
              </p>
            </Link>
            <button
              type="button"
              onClick={() =>
                setDismissed((prev) => new Set(prev).add(a.id))
              }
              className="rounded-lg p-1 text-foreground/50 transition-colors hover:bg-background/60 hover:text-foreground"
              aria-label="إغلاق"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </section>
  );
}
