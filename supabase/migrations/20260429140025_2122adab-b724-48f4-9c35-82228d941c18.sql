-- Phase 2: Drop legacy distributor system tables, triggers, functions, and columns.
-- Marketplace architecture only: vendor / client / admin.

-- 1. Drop triggers that depend on legacy tables/columns
DROP TRIGGER IF EXISTS trg_orders_distributor_rules ON public.orders;
DROP TRIGGER IF EXISTS trg_enforce_order_item_product_zone ON public.order_items;
DROP TRIGGER IF EXISTS trg_enforce_order_min_amount ON public.orders;
DROP TRIGGER IF EXISTS trg_enforce_order_min_amount_item ON public.order_items;
DROP TRIGGER IF EXISTS trg_create_partner_commission ON public.orders;
DROP TRIGGER IF EXISTS trg_approve_partner_commission ON public.orders;
DROP TRIGGER IF EXISTS trg_credit_loyalty_on_order_insert ON public.orders;
DROP TRIGGER IF EXISTS trg_credit_loyalty_on_order_update ON public.orders;
DROP TRIGGER IF EXISTS credit_loyalty_on_order_trigger ON public.orders;
DROP TRIGGER IF EXISTS trg_audit_loyalty_tx ON public.loyalty_transactions;
DROP TRIGGER IF EXISTS trg_audit_loyalty_points ON public.profiles;
DROP TRIGGER IF EXISTS trg_auto_promote_level ON public.profiles;
DROP TRIGGER IF EXISTS auto_promote_level_trigger ON public.profiles;
DROP TRIGGER IF EXISTS trg_enforce_phone_unique_per_territory ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_parent_same_company ON public.profiles;
DROP TRIGGER IF EXISTS trg_monthly_sales_insert ON public.orders;
DROP TRIGGER IF EXISTS trg_monthly_sales_update ON public.orders;
DROP TRIGGER IF EXISTS trg_monthly_sales_delete ON public.orders;
DROP TRIGGER IF EXISTS update_monthly_sales_on_order_trigger ON public.orders;
DROP TRIGGER IF EXISTS trg_dist_terr_consistency ON public.distributor_territories;
DROP TRIGGER IF EXISTS trg_product_zones_consistency ON public.product_zones;
DROP TRIGGER IF EXISTS trg_cdp_updated_at ON public.company_distributor_pricing;
DROP TRIGGER IF EXISTS trg_partners_updated_at ON public.partners;
DROP TRIGGER IF EXISTS trg_partner_commissions_updated_at ON public.partner_commissions;
DROP TRIGGER IF EXISTS update_pricing_tiers_updated_at ON public.pricing_tiers;
DROP TRIGGER IF EXISTS trg_order_rules_updated_at ON public.order_rules;

-- 2. Drop functions that reference legacy tables/columns
DROP FUNCTION IF EXISTS public.enforce_order_distributor_rules() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_order_item_product_zone() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_order_min_amount() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_order_min_amount_via_item() CASCADE;
DROP FUNCTION IF EXISTS public.create_partner_commission_on_order() CASCADE;
DROP FUNCTION IF EXISTS public.approve_partner_commission_on_delivery() CASCADE;
DROP FUNCTION IF EXISTS public.default_commission_rate() CASCADE;
DROP FUNCTION IF EXISTS public.credit_loyalty_on_order() CASCADE;
DROP FUNCTION IF EXISTS public.audit_loyalty_transaction_insert() CASCADE;
DROP FUNCTION IF EXISTS public.audit_loyalty_points_changes() CASCADE;
DROP FUNCTION IF EXISTS public.auto_promote_level() CASCADE;
DROP FUNCTION IF EXISTS public.level_for_points(integer) CASCADE;
DROP FUNCTION IF EXISTS public.update_monthly_sales_on_order() CASCADE;
DROP FUNCTION IF EXISTS public.reset_monthly_sales() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_phone_unique_per_territory() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_parent_distributor_same_company() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_distributor_territory_consistency() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_product_zone_consistency() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_sales_agent_consistency() CASCADE;
DROP FUNCTION IF EXISTS public.partner_invite_info(text) CASCADE;
DROP FUNCTION IF EXISTS public.accept_partner_invite(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.is_partner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_enabled_distributor_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.log_territory_change() CASCADE;

-- 3. Drop legacy tables (CASCADE removes dependent policies/views)
DROP TABLE IF EXISTS public.partner_commissions CASCADE;
DROP TABLE IF EXISTS public.partner_invites CASCADE;
DROP TABLE IF EXISTS public.partners CASCADE;
DROP TABLE IF EXISTS public.sales_agents CASCADE;
DROP TABLE IF EXISTS public.distributor_territories CASCADE;
DROP TABLE IF EXISTS public.product_zones CASCADE;
DROP TABLE IF EXISTS public.company_distributor_pricing CASCADE;
DROP TABLE IF EXISTS public.pricing_tiers CASCADE;
DROP TABLE IF EXISTS public.loyalty_transactions CASCADE;
DROP TABLE IF EXISTS public.quick_order_templates CASCADE;
DROP TABLE IF EXISTS public.order_rules CASCADE;
DROP TABLE IF EXISTS public.territories CASCADE;

-- 4. Strip legacy columns from orders
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS partner_id CASCADE,
  DROP COLUMN IF EXISTS supplier_partner_id CASCADE,
  DROP COLUMN IF EXISTS points_earned CASCADE;

-- 5. Strip profiles down to identity only
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS territory_id CASCADE,
  DROP COLUMN IF EXISTS account_type CASCADE,
  DROP COLUMN IF EXISTS level CASCADE,
  DROP COLUMN IF EXISTS loyalty_points CASCADE,
  DROP COLUMN IF EXISTS monthly_sales CASCADE,
  DROP COLUMN IF EXISTS parent_distributor_id CASCADE;

-- 6. Drop orphan enums no longer referenced
DROP TYPE IF EXISTS public.partner_type CASCADE;
DROP TYPE IF EXISTS public.partner_status CASCADE;
DROP TYPE IF EXISTS public.partner_invite_status CASCADE;
DROP TYPE IF EXISTS public.commission_status CASCADE;
DROP TYPE IF EXISTS public.distributor_level CASCADE;

-- 7. Drop legacy roles from app_role enum values via user_roles cleanup
-- (enum values can't be dropped in postgres safely; just remove rows)
DELETE FROM public.user_roles
  WHERE role::text IN ('partner', 'sales_agent', 'distributor', 'buyer', 'seller');

-- 8. Update public_signup_company to not reference territories/account_type
CREATE OR REPLACE FUNCTION public.public_signup_company(
  _company_name text, _company_slug text, _admin_full_name text,
  _admin_email text, _admin_password text, _brand_color text DEFAULT '#16a34a'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $$
DECLARE
  reserved text[] := ARRAY['app','www','api','admin','super','nexora','root','platform','dashboard','login','signup'];
  clean_slug text;
  clean_email text;
  new_user_id uuid;
  new_company_id uuid;
  encrypted_pw text;
BEGIN
  IF _company_name IS NULL OR length(trim(_company_name)) < 2 THEN
    RAISE EXCEPTION 'اسم الشركة قصير جداً' USING ERRCODE = 'check_violation';
  END IF;

  clean_slug := lower(coalesce(_company_slug, _company_name));
  clean_slug := regexp_replace(clean_slug, '\s+', '-', 'g');
  clean_slug := regexp_replace(clean_slug, '[^a-z0-9-]', '', 'g');
  clean_slug := regexp_replace(clean_slug, '-+', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);
  IF clean_slug IS NULL OR length(clean_slug) < 2 THEN
    RAISE EXCEPTION 'النطاق الفرعي غير صالح' USING ERRCODE = 'check_violation';
  END IF;
  IF clean_slug = ANY(reserved) THEN
    RAISE EXCEPTION 'هذا النطاق محجوز' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE slug = clean_slug OR name = clean_slug) THEN
    RAISE EXCEPTION 'النطاق "%" مستخدم بالفعل', clean_slug USING ERRCODE = 'unique_violation';
  END IF;

  clean_email := lower(trim(_admin_email));
  IF clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'بريد المسؤول غير صالح' USING ERRCODE = 'check_violation';
  END IF;
  IF _admin_password IS NULL OR length(_admin_password) < 8
     OR _admin_password !~ '[A-Za-z]' OR _admin_password !~ '[0-9]' THEN
    RAISE EXCEPTION 'كلمة المرور يجب 8 أحرف على الأقل وحروف وأرقام' USING ERRCODE = 'check_violation';
  END IF;
  IF _admin_full_name IS NULL OR length(trim(_admin_full_name)) < 2 THEN
    RAISE EXCEPTION 'اسم المسؤول مطلوب' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = clean_email) THEN
    RAISE EXCEPTION 'البريد % مستخدم بالفعل', clean_email USING ERRCODE = 'unique_violation';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(_admin_password, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id, 'authenticated', 'authenticated', clean_email,
    encrypted_pw, now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name', trim(_admin_full_name)),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', clean_email, 'email_verified', true),
    'email', clean_email, now(), now(), now()
  );

  INSERT INTO public.companies (name, slug, display_name, brand_color)
  VALUES (clean_slug, clean_slug, trim(_company_name), coalesce(_brand_color, '#16a34a'))
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, full_name, company_id)
  VALUES (new_user_id, trim(_admin_full_name), new_company_id);

  -- Vendor role for the company creator (single marketplace role)
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new_user_id, 'vendor', new_company_id);
  -- Also keep admin (for company-scoped admin actions)
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new_user_id, 'admin', new_company_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'company_id', new_company_id,
    'admin_user_id', new_user_id,
    'slug', clean_slug
  );
END;
$$;

-- 9. Update provision_company to skip territories
CREATE OR REPLACE FUNCTION public.provision_company(
  _name text, _display_name text, _admin_user_id uuid,
  _brand_color text DEFAULT '#16a34a', _logo_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_company_id uuid;
  computed_slug text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can provision companies';
  END IF;

  computed_slug := lower(_name);
  computed_slug := regexp_replace(computed_slug, '\s+', '-', 'g');
  computed_slug := regexp_replace(computed_slug, '[^a-z0-9-]', '', 'g');
  computed_slug := regexp_replace(computed_slug, '-+', '-', 'g');
  computed_slug := trim(both '-' from computed_slug);
  IF computed_slug IS NULL OR computed_slug = '' THEN
    computed_slug := 'company-' || substr(gen_random_uuid()::text, 1, 8);
  END IF;

  INSERT INTO public.companies (name, slug, display_name, brand_color, logo_url)
  VALUES (_name, computed_slug, COALESCE(NULLIF(_display_name, ''), _name), _brand_color, _logo_url)
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, full_name, company_id)
  VALUES (_admin_user_id, '', new_company_id)
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (_admin_user_id, 'vendor', new_company_id)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (_admin_user_id, 'admin', new_company_id)
  ON CONFLICT DO NOTHING;

  RETURN new_company_id;
END;
$$;

-- 10. Drop sales_agents RLS reference in orders policy
DROP POLICY IF EXISTS "Sales agents view orders in their zones" ON public.orders;
DROP POLICY IF EXISTS "Partners create own orders" ON public.orders;
DROP POLICY IF EXISTS "Partners insert items for own orders" ON public.order_items;
DROP POLICY IF EXISTS "Insert order items for own order" ON public.order_items;

-- Replace with marketplace-only insert policy for order_items (clients only)
CREATE POLICY "Clients insert items for own orders"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.distributor_id = auth.uid()
      AND public.has_role(auth.uid(), 'client'::public.app_role)
  )
);

-- 11. Drop legacy "Create orders in company" policy that referenced has_enabled_distributor_role
DROP POLICY IF EXISTS "Create orders in company" ON public.orders;
