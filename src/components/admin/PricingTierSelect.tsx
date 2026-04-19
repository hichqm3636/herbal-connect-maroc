import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export interface PricingTierLite {
  id: string;
  name: string;
  base_discount_percent: number;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

const NONE = "__none__";

export function PricingTierSelect({ value, onChange, placeholder = "اختر فئة التسعير" }: Props) {
  const [tiers, setTiers] = useState<PricingTierLite[]>([]);

  useEffect(() => {
    supabase
      .from("pricing_tiers")
      .select("id, name, base_discount_percent")
      .order("base_discount_percent", { ascending: true })
      .then(({ data }) => setTiers((data ?? []) as PricingTierLite[]));
  }, []);

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>بدون فئة</SelectItem>
        {tiers.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name} — {t.base_discount_percent}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
