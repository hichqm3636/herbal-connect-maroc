-- Vendor-set manual payment info
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_instructions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_phone text;

-- Allow authenticated marketplace clients to place orders at any LISTED vendor.
-- The order's company_id is the vendor; distributor_id is the buyer (auth.uid()).
CREATE POLICY "Marketplace clients create orders at vendors"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND distributor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = orders.company_id AND c.is_listed = true
  )
);

-- Allow buyers to view their own orders across any vendor (marketplace).
CREATE POLICY "Buyers view own marketplace orders"
ON public.orders
FOR SELECT
TO authenticated
USING (distributor_id = auth.uid());

-- Allow buyers to insert order_items for their own marketplace order
-- (without requiring company match in profiles).
CREATE POLICY "Buyers insert items for own marketplace orders"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.distributor_id = auth.uid()
  )
);

-- Allow buyers to view items of their own marketplace orders.
CREATE POLICY "Buyers view items of own marketplace orders"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.distributor_id = auth.uid()
  )
);