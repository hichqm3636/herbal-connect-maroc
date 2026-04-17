
-- 1) Territories table
CREATE TABLE public.territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX territories_name_key ON public.territories (lower(name));

ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view territories"
ON public.territories FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins manage territories"
ON public.territories FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_territories_updated_at
BEFORE UPDATE ON public.territories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Seed defaults
INSERT INTO public.territories (name, slug) VALUES
  ('الرباط', 'rabat'),
  ('الدار البيضاء', 'casablanca'),
  ('طنجة', 'tangier'),
  ('أكادير', 'agadir'),
  ('غير محدد', 'unassigned');

-- 3) Add territory_id to profiles, backfill, then enforce NOT NULL
ALTER TABLE public.profiles ADD COLUMN territory_id uuid REFERENCES public.territories(id) ON DELETE RESTRICT;

UPDATE public.profiles p SET territory_id = (
  SELECT t.id FROM public.territories t
  WHERE
    (p.city ILIKE '%casablanca%' OR p.city ILIKE '%الدار%' OR p.city ILIKE '%بيضاء%') AND t.slug = 'casablanca'
    OR (p.city ILIKE '%rabat%' OR p.city ILIKE '%رباط%') AND t.slug = 'rabat'
    OR (p.city ILIKE '%tang%' OR p.city ILIKE '%طنج%') AND t.slug = 'tangier'
    OR (p.city ILIKE '%agadir%' OR p.city ILIKE '%أكادير%' OR p.city ILIKE '%اكادير%') AND t.slug = 'agadir'
  LIMIT 1
);

UPDATE public.profiles
SET territory_id = (SELECT id FROM public.territories WHERE slug = 'unassigned')
WHERE territory_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN territory_id SET NOT NULL;
CREATE INDEX profiles_territory_id_idx ON public.profiles (territory_id);

-- 4) Trigger-based phone uniqueness within territory for active distributors.
-- Validates on INSERT/UPDATE without breaking existing duplicate test data.
CREATE OR REPLACE FUNCTION public.enforce_phone_unique_per_territory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true AND NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id <> NEW.id
        AND is_active = true
        AND phone = NEW.phone
        AND territory_id = NEW.territory_id
    ) THEN
      RAISE EXCEPTION 'رقم الهاتف % مستخدم بالفعل في نفس المنطقة', NEW.phone
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_phone_unique_per_territory
BEFORE INSERT OR UPDATE OF phone, territory_id, is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_phone_unique_per_territory();

-- 5) Activity log trigger for territory changes
CREATE OR REPLACE FUNCTION public.log_territory_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  act text;
  tid uuid;
  meta jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    act := 'create_territory';
    tid := NEW.id;
    meta := jsonb_build_object('name', NEW.name, 'slug', NEW.slug);
  ELSIF TG_OP = 'UPDATE' THEN
    act := 'update_territory';
    tid := NEW.id;
    meta := jsonb_build_object('old_name', OLD.name, 'new_name', NEW.name, 'slug', NEW.slug);
  ELSIF TG_OP = 'DELETE' THEN
    act := 'delete_territory';
    tid := OLD.id;
    meta := jsonb_build_object('name', OLD.name, 'slug', OLD.slug);
  END IF;

  INSERT INTO public.admin_activity_log (admin_id, action, target_user_id, metadata)
  VALUES (uid, act, NULL, meta || jsonb_build_object('territory_id', tid));

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_territory_change
AFTER INSERT OR UPDATE OR DELETE ON public.territories
FOR EACH ROW EXECUTE FUNCTION public.log_territory_change();
