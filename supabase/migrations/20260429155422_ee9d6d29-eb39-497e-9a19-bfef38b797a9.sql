
-- 1) Remove self-assign role policy (privilege escalation surface)
DROP POLICY IF EXISTS "Users assign self marketplace role" ON public.user_roles;

-- 2) Backend-only role assignment for clients
CREATE OR REPLACE FUNCTION public.claim_client_role()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Refuse if user already holds any privileged role.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid
      AND role IN ('super_admin'::app_role, 'admin'::app_role, 'vendor'::app_role)
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'client'::app_role)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_client_role() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_client_role() TO authenticated;

-- 3) Backfill existing users with no role → client
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'client'::app_role
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id
)
ON CONFLICT DO NOTHING;

-- 4) Drop dead trigger + function referencing the removed profiles.account_type column
DROP TRIGGER IF EXISTS protect_and_audit_account_type ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_and_audit_account_type ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_and_audit_account_type() CASCADE;

-- 5) Fix new-order notification link → /vendor/orders?focus=<id>
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_name text;
  admin_row record;
BEGIN
  SELECT COALESCE(NULLIF(trim(full_name), ''), 'شريك') INTO partner_name
  FROM public.profiles WHERE id = NEW.distributor_id;

  FOR admin_row IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::app_role, 'vendor'::app_role)
      AND ur.company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id,
      admin_row.user_id,
      'order_created',
      'طلب جديد ' || NEW.order_number,
      'من ' || partner_name || ' بقيمة ' || to_char(NEW.total_mad, 'FM999G999G990D00') || ' MAD',
      '/vendor/orders?focus=' || NEW.id,
      jsonb_build_object(
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'total_mad', NEW.total_mad,
        'distributor_id', NEW.distributor_id
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;
