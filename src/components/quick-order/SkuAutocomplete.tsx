import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getHiddenProductIds } from "@/lib/productZones";

interface Suggestion {
  id: string;
  sku: string | null;
  name_ar: string;
  price_mad: number;
  stock: number;
  image_url: string | null;
}

interface Props {
  value: string;
  onChange: (sku: string) => void;
  onSelect?: (s: Suggestion) => void;
  placeholder?: string;
  className?: string;
}

export function SkuAutocomplete({ value, onChange, onSelect, placeholder, className }: Props) {
  const { territoryId, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name_ar, price_mad, stock, image_url")
        .eq("active", true)
        .or(`sku.ilike.%${term}%,name_ar.ilike.%${term}%`)
        .limit(8);
      if (!error) {
        const rows = (data ?? []) as Suggestion[];
        const visible = isAdmin
          ? rows
          : await (async () => {
              const hidden = await getHiddenProductIds(
                rows.map((r) => r.id),
                territoryId,
              );
              return rows.filter((r) => !hidden.has(r.id));
            })();
        setResults(visible);
        setActiveIdx(0);
      }
      setLoading(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, territoryId, isAdmin]);

  const choose = (s: Suggestion) => {
    onChange(s.sku ?? "");
    onSelect?.(s);
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open && (loading || results.length > 0)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          dir="ltr"
          className={cn("font-mono", className)}
          autoComplete="off"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[min(420px,90vw)] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        dir="rtl"
      >
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            بحث…
          </div>
        )}
        {!loading && results.length === 0 && value.trim().length >= 2 && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            لا توجد نتائج
          </div>
        )}
        {!loading &&
          results.map((r, idx) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-right text-sm transition-colors",
                idx === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              {r.image_url ? (
                <img
                  src={r.image_url}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name_ar}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span dir="ltr" className="font-mono">{r.sku ?? "—"}</span>
                  <span>•</span>
                  <span>{formatMAD(Number(r.price_mad))}</span>
                  <span>•</span>
                  <span>المخزون: {r.stock}</span>
                </div>
              </div>
            </button>
          ))}
      </PopoverContent>
    </Popover>
  );
}
