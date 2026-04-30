CREATE OR REPLACE FUNCTION public.product_trust_signals(_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH oi AS (
    SELECT o.id AS order_id, o.created_at, o.buyer_id
    FROM public.order_items i
    JOIN public.orders o ON o.id = i.order_id
    WHERE i.product_id = _product_id
      AND o.status <> 'cancelled'
  )
  SELECT jsonb_build_object(
    'total_orders',  (SELECT COUNT(*)::int FROM oi),
    'buyers_7d',     (SELECT COUNT(DISTINCT buyer_id)::int FROM oi WHERE created_at >= now() - interval '7 days'),
    'buyers_24h',    (SELECT COUNT(DISTINCT buyer_id)::int FROM oi WHERE created_at >= now() - interval '24 hours')
  );
$$;

GRANT EXECUTE ON FUNCTION public.product_trust_signals(uuid) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_order_items_product_order
  ON public.order_items(product_id, order_id);