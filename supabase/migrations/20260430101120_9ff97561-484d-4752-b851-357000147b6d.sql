-- Update orders.payment_method check constraint to match application values.
-- Old: cash/transfer/credit/check (legacy, not used by app)
-- New: cod, bank_transfer, manual, card, stripe, cash

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

-- Migrate any legacy data so the new constraint can be added safely
UPDATE public.orders SET payment_method = 'bank_transfer' WHERE payment_method = 'transfer';
UPDATE public.orders SET payment_method = 'cod' WHERE payment_method IN ('cash','credit','check') AND payment_method IS NOT NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY['cod','bank_transfer','manual','card','stripe','cash']));