import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { OrderRule } from "@/lib/orderRules";

/**
 * Loads active order rules that apply to the current distributor:
 * all global rules (company_id IS NULL) + the current company's rules.
 * RLS already restricts visibility, so this just queries the table.
 */
export function useOrderRules() {
  const { companyId, session } = useAuth();
  const [rules, setRules] = useState<OrderRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setRules([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Read all rules visible to this user (RLS handles scope).
      // We further filter to active + applicable scope client-side.
      const { data, error } = await supabase
        .from("order_rules" as never)
        .select("*")
        .eq("active", true);
      if (cancelled) return;
      if (error) {
        console.error("[useOrderRules] load failed", error);
        setRules([]);
      } else {
        const list = (data as unknown as OrderRule[]) ?? [];
        // Keep global rules + current company rules
        setRules(
          list.filter((r) => r.company_id === null || r.company_id === companyId),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, companyId]);

  return { rules, loading };
}
