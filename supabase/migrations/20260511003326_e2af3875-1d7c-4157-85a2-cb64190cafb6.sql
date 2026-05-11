
DO $$ BEGIN
  CREATE TYPE public.company_type AS ENUM (
    'pharmacy',
    'supplements',
    'herbs',
    'medical_supplies',
    'sports_supplies',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_type public.company_type,
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;
