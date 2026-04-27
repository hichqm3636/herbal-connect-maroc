-- 1. Audit + protection trigger for profiles.account_type
CREATE OR REPLACE FUNCTION public.protect_and_audit_account_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_admin_caller boolean := false;
  source text;
BEGIN
  -- Only act when account_type actually changes
  IF NEW.account_type IS NOT DISTINCT FROM OLD.account_type THEN
    RETURN NEW;
  END IF;

  -- Determine caller authority
  IF uid IS NOT NULL THEN
    is_admin_caller := public.has_role(uid, 'admin'::app_role)
                    OR public.has_role(uid, 'super_admin'::app_role);
  END IF;

  -- Protection: block silent regression to 'distributor' from a real business type
  -- (pharmacy, parapharmacy, gym, etc.) unless caller is admin OR this runs from
  -- a SECURITY DEFINER context with no auth.uid() (e.g. invite acceptance system path).
  IF NEW.account_type = 'distributor'::partner_type
     AND OLD.account_type IS NOT NULL
     AND OLD.account_type <> 'distributor'::partner_type THEN
    IF NOT is_admin_caller AND uid IS NOT NULL THEN
      RAISE EXCEPTION
        'لا يمكن تغيير نوع الحساب من % إلى distributor. هذا الإجراء محصور بالمسؤول.',
        OLD.account_type
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Identify the source of the change for the audit log
  IF uid IS NULL THEN
    source := 'invite_flow'; -- SECURITY DEFINER path (RPC like accept_partner_invite)
  ELSIF is_admin_caller AND uid <> NEW.id THEN
    source := 'admin';
  ELSIF uid = NEW.id THEN
    source := 'self';
  ELSE
    source := 'system';
  END IF;

  -- Audit log entry
  INSERT INTO public.activity_logs (
    company_id, user_id, entity_type, entity_id, action,
    field_name, old_value, new_value, metadata
  ) VALUES (
    COALESCE(NEW.company_id, OLD.company_id),
    uid,
    'profile',
    NEW.id::text,
    'account_type_changed',
    'account_type',
    to_jsonb(OLD.account_type::text),
    to_jsonb(NEW.account_type::text),
    jsonb_build_object(
      'source', source,
      'target_user_id', NEW.id,
      'changed_at', now()
    )
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then attach
DROP TRIGGER IF EXISTS trg_protect_and_audit_account_type ON public.profiles;
CREATE TRIGGER trg_protect_and_audit_account_type
BEFORE UPDATE OF account_type ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_and_audit_account_type();