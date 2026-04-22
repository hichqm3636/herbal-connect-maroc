-- Phase 4: composite indexes for hot-path queries on tenant tables.
-- Drop now-redundant single-column indexes after the composite covers them.

-- orders: list + dashboards filter by company_id then sort by created_at,
-- and admin pages filter by status within a company.
CREATE INDEX IF NOT EXISTS idx_orders_company_created
  ON public.orders (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_status
  ON public.orders (company_id, status);
-- The single-column idx_orders_company is now covered as a prefix of the
-- composite indexes; drop it to avoid duplicate write amplification.
DROP INDEX IF EXISTS public.idx_orders_company;

-- order_items: catalog/order detail joins always filter by order, but
-- aggregate queries (top products per company) benefit from (company implied
-- via order) + product lookups. Keep order_id index, add product_id helper.
-- order_items has no company_id column; per-product analytics queries scan
-- by product_id, so a plain product_id index is the right fit here.
CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON public.order_items (product_id);

-- invoices already has (company_id, issue_date DESC). Add (company_id, status)
-- for unpaid/overdue dashboards.
CREATE INDEX IF NOT EXISTS idx_invoices_company_status
  ON public.invoices (company_id, status);

-- products: catalog filtering by company + active flag is the hot path.
CREATE INDEX IF NOT EXISTS idx_products_company_active
  ON public.products (company_id, active);
DROP INDEX IF EXISTS public.idx_products_company;