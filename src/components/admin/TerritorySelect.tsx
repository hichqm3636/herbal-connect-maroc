import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface TerritoryOption {
  id: string;
  name: string;
  slug: string;
}

export function useTerritories() {
  const [territories, setTerritories] = useState<TerritoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("territories")
        .select("id, name, slug")
        .order("name");
      if (!cancelled) {
        setTerritories((data ?? []) as TerritoryOption[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { territories, loading };
}

interface Props {
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TerritorySelect({ value, onChange, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const { territories, loading } = useTerritories();
  const selected = territories.find((t) => t.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected?.name ?? placeholder ?? "اختر المنطقة"}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="ابحث عن منطقة..." />
          <CommandList>
            <CommandEmpty>لا توجد نتائج.</CommandEmpty>
            <CommandGroup>
              {territories.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`${t.name} ${t.slug}`}
                  onSelect={() => {
                    onChange(t.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4",
                      value === t.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {t.slug}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
