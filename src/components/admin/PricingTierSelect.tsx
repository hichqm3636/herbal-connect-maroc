import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PricingTierLite {
  id: string;
  name: string;
  discount_percentage: number;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

const NONE = "__none__";

export function PricingTierSelect({ value, onChange, placeholder = "اختر فئة التسعير" }: Props) {
  const { companyId } = useAuth();
  const [tiers, setTiers] = useState<PricingTierLite[]>([]);

  useEffect(() => {
    if (!companyId) return;
    supabase
      .from("pricing_tiers")
      .select("id, name, discount_percentage")
      .eq("company_id", companyId)
      .order("discount_percentage", { ascending: true })
      .then(({ data }) => setTiers((data ?? []) as PricingTierLite[]));
  }, [companyId]);

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
            {t.name} — {t.discount_percentage}%
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
