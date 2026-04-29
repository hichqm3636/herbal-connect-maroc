DO $$ BEGIN
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'vendor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'client';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
