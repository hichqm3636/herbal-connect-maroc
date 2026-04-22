-- Enums
DO $$ BEGIN
  CREATE TYPE public.partner_status AS ENUM ('invited','active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_invite_status AS ENUM ('pending','accepted','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- partners
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  type public.partner_type NOT NULL,
  email text NOT NULL,
  phone text,
  city text,
  status public.partner_status NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partners_company ON public.partners(company_id);
CREATE INDEX IF NOT EXISTS idx_partners_user ON public.partners(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partners_company_email
  ON public.partners(company_id, lower(email));

CREATE TRIGGER trg_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage partners"
  ON public.partners FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())
         OR (company_id = current_company_id() AND has_role(auth.uid(),'admin')))
  WITH CHECK (is_super_admin(auth.uid())
         OR (company_id = current_company_id() AND has_role(auth.uid(),'admin')));

CREATE POLICY "Partner views own row"
  ON public.partners FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- partner_invites
CREATE TABLE IF NOT EXISTS public.partner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  partner_type public.partner_type NOT NULL,
  partner_name text,
  phone text,
  city text,
  invite_token text NOT NULL UNIQUE,
  status public.partner_invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_invites_company ON public.partner_invites(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_invites_token ON public.partner_invites(invite_token);

ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage invites"
  ON public.partner_invites FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())
         OR (company_id = current_company_id() AND has_role(auth.uid(),'admin')))
  WITH CHECK (is_super_admin(auth.uid())
         OR (company_id = current_company_id() AND has_role(auth.uid(),'admin')));

-- Public lookup by token (anon + authenticated). Returns row only when matched
-- by exact token, so this does not leak the table.
CREATE POLICY "Public can read invite by token"
  ON public.partner_invites FOR SELECT TO anon, authenticated
  USING (true);

-- Accept an invite atomically: validates token, creates partner row,
-- links the calling user, marks invite accepted.
CREATE OR REPLACE FUNCTION public.accept_partner_invite(_token text, _full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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

  -- Pick (or create) the default "unassigned" territory for this company
  SELECT id INTO default_territory FROM public.territories
   WHERE company_id = inv.company_id ORDER BY created_at ASC LIMIT 1;
  IF default_territory IS NULL THEN
    INSERT INTO public.territories (company_id, name, slug)
    VALUES (inv.company_id, 'غير محدد', 'unassigned-' || substr(inv.company_id::text,1,8))
    RETURNING id INTO default_territory;
  END IF;

  -- Ensure profile exists and is attached to this company
  INSERT INTO public.profiles (id, full_name, territory_id, company_id, account_type)
  VALUES (uid, COALESCE(NULLIF(trim(_full_name),''), inv.partner_name, inv.email),
          default_territory, inv.company_id, inv.partner_type)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        territory_id = COALESCE(public.profiles.territory_id, EXCLUDED.territory_id),
        account_type = EXCLUDED.account_type,
        full_name = COALESCE(NULLIF(trim(_full_name),''), public.profiles.full_name);

  -- Grant buyer role scoped to this company
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (uid, 'buyer', inv.company_id)
  ON CONFLICT DO NOTHING;

  -- Upsert partner row
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
$$;

-- Public lookup helper for the accept page (returns only safe fields).
CREATE OR REPLACE FUNCTION public.partner_invite_info(_token text)
RETURNS TABLE(
  email text,
  partner_type public.partner_type,
  partner_name text,
  status public.partner_invite_status,
  expires_at timestamptz,
  company_id uuid,
  company_name text,
  company_display_name text,
  company_brand_color text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.email, i.partner_type, i.partner_name, i.status, i.expires_at,
         c.id, c.name, c.display_name, c.brand_color
  FROM public.partner_invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.invite_token = _token
$$;

GRANT EXECUTE ON FUNCTION public.partner_invite_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite(text, text) TO authenticated;
