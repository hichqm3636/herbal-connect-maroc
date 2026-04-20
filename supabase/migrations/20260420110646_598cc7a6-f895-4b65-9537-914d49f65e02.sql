-- 1. Rename profiles.partner_type → profiles.account_type (keep enum type name as-is to avoid cascading type changes)
ALTER TABLE public.profiles RENAME COLUMN partner_type TO account_type;

-- 2. Extend app_role enum with new platform roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'buyer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_agent';

-- (enum values are committed implicitly; backfill runs in a separate migration step below)
