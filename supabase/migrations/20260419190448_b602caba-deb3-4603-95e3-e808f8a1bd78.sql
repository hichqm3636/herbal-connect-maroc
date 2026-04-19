-- Order Rules engine: company-scoped + global platform rules
CREATE TABLE public.order_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('MIN_ORDER_AMOUNT','MIN_POINTS','MIN_PRODUCTS')),
  min_order_amount numeric,
  min_points integer,
  min_products integer,
  tier_id uuid REFERENCES public.pricing_tiers(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_rules_company ON public.order_rules(company_id) WHERE active;
CREATE INDEX idx_order_rules_global ON public.order_rules(company_id) WHERE company_id IS NULL AND active;

ALTER TABLE public.order_rules ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active rules that apply to them (their company + global)
CREATE POLICY "View applicable order rules"
ON public.order_rules FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR company_id IS NULL
  OR company_id = current_company_id()
);

-- Super admin manages global rules (company_id IS NULL)
CREATE POLICY "Super admin manages global rules"
ON public.order_rules FOR ALL TO authenticated
USING (is_super_admin(auth.uid()) AND company_id IS NULL)
WITH CHECK (is_super_admin(auth.uid()) AND company_id IS NULL);

-- Company admin manages their own company's rules
CREATE POLICY "Company admin manages company rules"
ON public.order_rules FOR ALL TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = current_company_id()
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = current_company_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER trg_order_rules_updated_at
BEFORE UPDATE ON public.order_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();