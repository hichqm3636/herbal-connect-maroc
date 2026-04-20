-- Distributor ↔ Territory join table (multi-territory assignment)
CREATE TABLE public.distributor_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  territory_id uuid NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distributor_id, territory_id)
);

CREATE INDEX idx_dist_terr_distributor ON public.distributor_territories(distributor_id);
CREATE INDEX idx_dist_terr_territory ON public.distributor_territories(territory_id);
CREATE INDEX idx_dist_terr_company ON public.distributor_territories(company_id);

-- Consistency: distributor + territory must share company
CREATE OR REPLACE FUNCTION public.enforce_distributor_territory_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dist_company uuid;
  zone_company uuid;
BEGIN
  SELECT company_id INTO dist_company FROM public.profiles WHERE id = NEW.distributor_id;
  SELECT company_id INTO zone_company FROM public.territories WHERE id = NEW.territory_id;
  IF dist_company IS DISTINCT FROM NEW.company_id
     OR zone_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'distributor_territories: distributor, territory and row must share company_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dist_terr_consistency
BEFORE INSERT OR UPDATE ON public.distributor_territories
FOR EACH ROW EXECUTE FUNCTION public.enforce_distributor_territory_consistency();

-- RLS
ALTER TABLE public.distributor_territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage distributor territories as company admin"
ON public.distributor_territories
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "View own and company distributor territories"
ON public.distributor_territories
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR distributor_id = auth.uid()
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);