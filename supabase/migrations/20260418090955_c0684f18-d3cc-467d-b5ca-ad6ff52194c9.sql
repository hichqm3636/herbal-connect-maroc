
-- 1. WIPE
TRUNCATE TABLE
  public.admin_activity_log,
  public.loyalty_transactions,
  public.order_items,
  public.orders,
  public.product_images,
  public.products,
  public.quick_order_templates,
  public.user_roles,
  public.profiles,
  public.territories
RESTART IDENTITY CASCADE;

-- 2. companies
CREATE TABLE public.companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  logo_url     text,
  brand_color  text NOT NULL DEFAULT '#16a34a',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add company_id columns FIRST
ALTER TABLE public.profiles              ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles            ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.products              ADD COLUMN company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.orders                ADD COLUMN company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.loyalty_transactions  ADD COLUMN company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.territories           ADD COLUMN company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.quick_order_templates ADD COLUMN company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.admin_activity_log    ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX idx_profiles_company    ON public.profiles(company_id);
CREATE INDEX idx_user_roles_company  ON public.user_roles(company_id);
CREATE INDEX idx_products_company    ON public.products(company_id);
CREATE INDEX idx_orders_company      ON public.orders(company_id);
CREATE INDEX idx_loyalty_company     ON public.loyalty_transactions(company_id);
CREATE INDEX idx_territories_company ON public.territories(company_id);
CREATE INDEX idx_templates_company   ON public.quick_order_templates(company_id);
CREATE INDEX idx_activity_company    ON public.admin_activity_log(company_id);

-- 4. Helper functions
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 5. RLS: companies
CREATE POLICY "Super admins manage companies" ON public.companies FOR ALL
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Members view their company" ON public.companies FOR SELECT
  USING (id = public.current_company_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Company admins update own company" ON public.companies FOR UPDATE
  USING (id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role));

-- 6. profiles
DROP POLICY IF EXISTS "Admins delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;

CREATE POLICY "View profiles in same company" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Update own or company admin" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Delete by company admin or super" ON public.profiles FOR DELETE
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 7. user_roles
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;

CREATE POLICY "View roles in own scope" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Manage roles in own company" ON public.user_roles FOR ALL
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 8. products
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated view active products" ON public.products;

CREATE POLICY "View company products" ON public.products FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id()
        AND (active OR public.has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "Company admins manage products" ON public.products FOR ALL
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 9. product_images
DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
DROP POLICY IF EXISTS "View images of active products" ON public.product_images;

CREATE POLICY "View product images in company" ON public.product_images FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id
    AND (public.is_super_admin(auth.uid())
      OR (p.company_id = public.current_company_id()
          AND (p.active OR public.has_role(auth.uid(), 'admin'::app_role))))));
CREATE POLICY "Manage product images in company" ON public.product_images FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id
    AND (public.is_super_admin(auth.uid())
      OR (p.company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id
    AND (public.is_super_admin(auth.uid())
      OR (p.company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))));

-- 10. orders
DROP POLICY IF EXISTS "Admins delete orders" ON public.orders;
DROP POLICY IF EXISTS "Admins update orders" ON public.orders;
DROP POLICY IF EXISTS "Distributors create own orders" ON public.orders;
DROP POLICY IF EXISTS "Distributors view own orders" ON public.orders;

CREATE POLICY "View company orders" ON public.orders FOR SELECT
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id()
        AND (auth.uid() = distributor_id OR public.has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "Create own orders in company" ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = distributor_id AND company_id = public.current_company_id());
CREATE POLICY "Company admin update orders" ON public.orders FOR UPDATE
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Company admin delete orders" ON public.orders FOR DELETE
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 11. order_items
DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
DROP POLICY IF EXISTS "Insert items for own orders" ON public.order_items;
DROP POLICY IF EXISTS "View order items via order" ON public.order_items;

CREATE POLICY "View order items in company" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND (public.is_super_admin(auth.uid())
      OR (o.company_id = public.current_company_id()
          AND (auth.uid() = o.distributor_id OR public.has_role(auth.uid(), 'admin'::app_role))))));
CREATE POLICY "Insert order items for own order" ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND o.distributor_id = auth.uid() AND o.company_id = public.current_company_id()));
CREATE POLICY "Manage order items as company admin" ON public.order_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND (public.is_super_admin(auth.uid())
      OR (o.company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
    AND (public.is_super_admin(auth.uid())
      OR (o.company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))));

-- 12. loyalty_transactions
DROP POLICY IF EXISTS "Admins manage loyalty" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "View own loyalty" ON public.loyalty_transactions;

CREATE POLICY "View loyalty in company" ON public.loyalty_transactions FOR SELECT
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id()
        AND (auth.uid() = distributor_id OR public.has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY "Manage loyalty as company admin" ON public.loyalty_transactions FOR ALL
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 13. territories
DROP POLICY IF EXISTS "Admins manage territories" ON public.territories;
DROP POLICY IF EXISTS "Anyone authenticated can view territories" ON public.territories;

CREATE POLICY "View company territories" ON public.territories FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR company_id = public.current_company_id());
CREATE POLICY "Manage company territories" ON public.territories FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 14. quick_order_templates
DROP POLICY IF EXISTS "Users delete own templates" ON public.quick_order_templates;
DROP POLICY IF EXISTS "Users insert own templates" ON public.quick_order_templates;
DROP POLICY IF EXISTS "Users update own templates" ON public.quick_order_templates;
DROP POLICY IF EXISTS "Users view own templates" ON public.quick_order_templates;

CREATE POLICY "View own templates in company" ON public.quick_order_templates FOR SELECT
  USING (auth.uid() = user_id AND company_id = public.current_company_id());
CREATE POLICY "Insert own templates in company" ON public.quick_order_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id AND company_id = public.current_company_id());
CREATE POLICY "Update own templates in company" ON public.quick_order_templates FOR UPDATE
  USING (auth.uid() = user_id AND company_id = public.current_company_id());
CREATE POLICY "Delete own templates in company" ON public.quick_order_templates FOR DELETE
  USING (auth.uid() = user_id AND company_id = public.current_company_id());

-- 15. admin_activity_log
DROP POLICY IF EXISTS "Admins insert activity log" ON public.admin_activity_log;
DROP POLICY IF EXISTS "Admins read activity log" ON public.admin_activity_log;

CREATE POLICY "Read activity in company" ON public.admin_activity_log FOR SELECT
  USING (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Insert activity in company" ON public.admin_activity_log FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

-- 16. Stop auto-provisioning on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- 17. Provision-company RPC (super admin only)
CREATE OR REPLACE FUNCTION public.provision_company(
  _name text,
  _display_name text,
  _admin_user_id uuid,
  _brand_color text DEFAULT '#16a34a',
  _logo_url text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_company_id uuid;
  default_territory_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can provision companies';
  END IF;

  INSERT INTO public.companies (name, display_name, brand_color, logo_url)
  VALUES (_name, COALESCE(NULLIF(_display_name, ''), _name), _brand_color, _logo_url)
  RETURNING id INTO new_company_id;

  INSERT INTO public.territories (company_id, name, slug)
  VALUES (new_company_id, 'غير محدد', 'unassigned-' || substr(new_company_id::text, 1, 8))
  RETURNING id INTO default_territory_id;

  INSERT INTO public.profiles (id, full_name, territory_id, company_id)
  VALUES (_admin_user_id, '', default_territory_id, new_company_id)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        territory_id = EXCLUDED.territory_id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (_admin_user_id, 'admin', new_company_id)
  ON CONFLICT DO NOTHING;

  RETURN new_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_company(text, text, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_company(text, text, uuid, text, text) TO authenticated;
