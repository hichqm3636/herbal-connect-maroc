import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
  className?: string;
  showNumber?: boolean;
  count?: number;
}

const sizeMap = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-6 w-6",
};

export function StarRating({
  value,
  onChange,
  size = "md",
  readOnly = false,
  className,
  showNumber = false,
  count,
}: StarRatingProps) {
  const cls = sizeMap[size];
  const interactive = !readOnly && !!onChange;
  return (
    <div className={cn("inline-flex items-center gap-1", className)} dir="ltr">
      <div className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= Math.round(value);
          return (
            <button
              key={n}
              type="button"
              disabled={!interactive}
              onClick={() => onChange?.(n)}
              className={cn(
                "transition-transform",
                interactive && "hover:scale-110 cursor-pointer",
                !interactive && "cursor-default",
              )}
              aria-label={`${n} نجوم`}
            >
              <Star
                className={cn(
                  cls,
                  filled
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-transparent text-muted-foreground/40",
                )}
              />
            </button>
          );
        })}
      </div>
      {showNumber && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.toFixed(1)}
          {typeof count === "number" && ` (${count})`}
        </span>
      )}
    </div>
  );
}
