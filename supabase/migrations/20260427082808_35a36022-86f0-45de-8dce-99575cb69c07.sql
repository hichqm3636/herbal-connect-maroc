-- Fix partner system: separate account_type (business type) from role (system role).
-- The accept_partner_invite RPC was granting 'buyer' role, which broke is_partner()
-- and prevented users from showing up as partners. We now grant 'partner' role,
-- and we make sure account_type from the invite is preserved exactly.

CREATE OR REPLACE FUNCTION public.accept_partner_invite(_token text, _full_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  inv public.partner_invites%ROWTYPE;
  uid uuid := auth.uid();
  partner_id uuid;
  default_territory uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO inv FROM public.partner_invites WHERE invite_token = _token;
  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'دعوة غير صالحة' USING ERRCODE = 'check_violation';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'تم استخدام هذه الدعوة من قبل' USING ERRCODE = 'check_violation';
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE public.partner_invites SET status='expired' WHERE id = inv.id;
    RAISE EXCEPTION 'انتهت صلاحية الدعوة' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO default_territory FROM public.territories
   WHERE company_id = inv.company_id ORDER BY created_at ASC LIMIT 1;
  IF default_territory IS NULL THEN
    INSERT INTO public.territories (company_id, name, slug)
    VALUES (inv.company_id, 'غير محدد', 'unassigned-' || substr(inv.company_id::text,1,8))
    RETURNING id INTO default_territory;
  END IF;

  -- Profile: account_type = business type from invite (pharmacy/gym/etc).
  -- Always overwrite account_type to match the invite (source of truth).
  INSERT INTO public.profiles (id, full_name, territory_id, company_id, account_type)
  VALUES (uid, COALESCE(NULLIF(trim(_full_name),''), inv.partner_name, inv.email),
          default_territory, inv.company_id, inv.partner_type)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        territory_id = COALESCE(public.profiles.territory_id, EXCLUDED.territory_id),
        account_type = EXCLUDED.account_type, -- always sync account_type to invite
        full_name = COALESCE(NULLIF(trim(_full_name),''), public.profiles.full_name);

  -- Grant PARTNER role (system role) — this is what is_partner() checks.
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (uid, 'partner', inv.company_id)
  ON CONFLICT DO NOTHING;

  -- Upsert partner row (canonical partner registry)
  INSERT INTO public.partners (company_id, user_id, name, type, email, phone, city, status)
  VALUES (inv.company_id, uid,
          COALESCE(inv.partner_name, NULLIF(trim(_full_name),''), inv.email),
          inv.partner_type, inv.email, inv.phone, inv.city, 'active')
  ON CONFLICT (company_id, lower(email)) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        status = 'active',
        name = COALESCE(EXCLUDED.name, public.partners.name),
        phone = COALESCE(public.partners.phone, EXCLUDED.phone),
        city = COALESCE(public.partners.city, EXCLUDED.city),
        updated_at = now()
  RETURNING id INTO partner_id;

  UPDATE public.partner_invites
     SET status = 'accepted', accepted_at = now(), accepted_by = uid
   WHERE id = inv.id;

  RETURN jsonb_build_object(
    'company_id', inv.company_id,
    'partner_id', partner_id,
    'partner_type', inv.partner_type
  );
END;
$function$;

-- Backfill: any existing partners row whose linked user has buyer-only role
-- should also have the partner role granted (idempotent).
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT p.user_id, 'partner'::app_role, p.company_id
FROM public.partners p
WHERE p.user_id IS NOT NULL
ON CONFLICT DO NOTHING;