-- Add 'processing' to order_status enum (canonical name per state machine).
-- 'preparing' is kept for backward compatibility with any existing rows.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'processing';

-- Index for faster status filtering on orders board.
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON public.orders(company_id, status);