CREATE POLICY "order_items_company_match" ON public.order_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.products p ON p.id = order_items.product_id
    WHERE o.id = order_items.order_id
      AND o.company_id = p.company_id
  )
);