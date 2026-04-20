-- 1) Territories: add optional city
ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS city text;

-- 2) Profiles: parent distributor (hierarchy)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS parent_distributor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_parent_distributor_idx
  ON public.profiles(parent_distributor_id);

-- Ensure parent distributor is in the same company
CREATE OR REPLACE FUNCTION public.enforce_parent_distributor_same_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_company uuid;
BEGIN
  IF NEW.parent_distributor_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_distributor_id = NEW.id THEN
    RAISE EXCEPTION 'parent_distributor_id cannot reference self';
  END IF;
  SELECT company_id INTO parent_company FROM public.profiles WHERE id = NEW.parent_distributor_id;
  IF parent_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'parent distributor must belong to the same company';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_parent_same_company ON public.profiles;
CREATE TRIGGER trg_profiles_parent_same_company
  BEFORE INSERT OR UPDATE OF parent_distributor_id, company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_distributor_same_company();

-- 3) Sales agents: profile <-> territory
CREATE TABLE IF NOT EXISTS public.sales_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, zone_id)
);

CREATE INDEX IF NOT EXISTS sales_agents_company_idx ON public.sales_agents(company_id);
CREATE INDEX IF NOT EXISTS sales_agents_zone_idx ON public.sales_agents(zone_id);
CREATE INDEX IF NOT EXISTS sales_agents_profile_idx ON public.sales_agents(profile_id);

ALTER TABLE public.sales_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View sales agents in company"
ON public.sales_agents FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id()
      AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR profile_id = auth.uid()))
);

CREATE POLICY "Company admins manage sales agents"
ON public.sales_agents FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- Validate sales_agent: profile, company and zone must align
CREATE OR REPLACE FUNCTION public.enforce_sales_agent_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prof_company uuid;
  zone_company uuid;
BEGIN
  SELECT company_id INTO prof_company FROM public.profiles WHERE id = NEW.profile_id;
  SELECT company_id INTO zone_company FROM public.territories WHERE id = NEW.zone_id;
  IF prof_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'sales agent profile must belong to the same company';
  END IF;
  IF zone_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'sales agent zone must belong to the same company';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_agents_consistency ON public.sales_agents;
CREATE TRIGGER trg_sales_agents_consistency
  BEFORE INSERT OR UPDATE ON public.sales_agents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_agent_consistency();

CREATE TRIGGER trg_sales_agents_updated_at
  BEFORE UPDATE ON public.sales_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Product zone restrictions
CREATE TABLE IF NOT EXISTS public.product_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, zone_id)
);

CREATE INDEX IF NOT EXISTS product_zones_company_idx ON public.product_zones(company_id);
CREATE INDEX IF NOT EXISTS product_zones_product_idx ON public.product_zones(product_id);
CREATE INDEX IF NOT EXISTS product_zones_zone_idx ON public.product_zones(zone_id);

ALTER TABLE public.product_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View product zones in company"
ON public.product_zones FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR company_id = public.current_company_id()
);

CREATE POLICY "Company admins manage product zones"
ON public.product_zones FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- Validate product_zones: product and zone must share company_id
CREATE OR REPLACE FUNCTION public.enforce_product_zone_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prod_company uuid;
  zone_company uuid;
BEGIN
  SELECT company_id INTO prod_company FROM public.products WHERE id = NEW.product_id;
  SELECT company_id INTO zone_company FROM public.territories WHERE id = NEW.zone_id;
  IF prod_company IS DISTINCT FROM NEW.company_id OR zone_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'product_zones: product, zone and row must share company_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_zones_consistency ON public.product_zones;
CREATE TRIGGER trg_product_zones_consistency
  BEFORE INSERT OR UPDATE ON public.product_zones
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_zone_consistency();

-- 5) Order enforcement (distributor company match + has territory)
CREATE OR REPLACE FUNCTION public.enforce_order_distributor_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dist_company uuid;
  dist_territory uuid;
BEGIN
  SELECT company_id, territory_id INTO dist_company, dist_territory
  FROM public.profiles WHERE id = NEW.distributor_id;

  IF dist_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'order distributor must belong to order company';
  END IF;
  IF dist_territory IS NULL THEN
    RAISE EXCEPTION 'order distributor must be assigned to a territory';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_distributor_rules ON public.orders;
CREATE TRIGGER trg_orders_distributor_rules
  BEFORE INSERT OR UPDATE OF distributor_id, company_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_distributor_rules();

-- 6) Sales agents can SELECT orders in their assigned zones (additive policy)
CREATE POLICY "Sales agents view orders in their zones"
ON public.orders FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sales_agents sa
    JOIN public.profiles dp ON dp.id = orders.distributor_id
    WHERE sa.profile_id = auth.uid()
      AND sa.active = true
      AND sa.company_id = orders.company_id
      AND sa.zone_id = dp.territory_id
  )
);