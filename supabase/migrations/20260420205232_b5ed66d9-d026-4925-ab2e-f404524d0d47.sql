-- Add 'gym' to partner_type enum
ALTER TYPE public.partner_type ADD VALUE IF NOT EXISTS 'gym';

-- Add payment_method column to orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN payment_method text CHECK (payment_method IN ('cash','transfer','credit','check'));
  END IF;
END$$;