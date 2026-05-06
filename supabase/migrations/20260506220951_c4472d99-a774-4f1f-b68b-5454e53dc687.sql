
-- ============================================
-- 1. PERFORMANCE INDEXES (multi-tenant scale)
-- ============================================

-- Orders: most common access patterns
CREATE INDEX IF NOT EXISTS idx_orders_company_created ON public.orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_status ON public.orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON public.orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_payment_status ON public.orders(company_id, payment_status);

-- Order items: lookup by order
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- Products: vendor catalog browsing & filters
CREATE INDEX IF NOT EXISTS idx_products_company_active ON public.products(company_id, active);
CREATE INDEX IF NOT EXISTS idx_products_company_category ON public.products(company_id, category);
CREATE INDEX IF NOT EXISTS idx_products_company_created ON public.products(company_id, created_at DESC);

-- Invoices: vendor billing list & buyer history
CREATE INDEX IF NOT EXISTS idx_invoices_company_created ON public.invoices(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON public.invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer ON public.invoices(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices(order_id);

-- Invoice items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_company_paid ON public.payments(company_id, paid_at DESC);

-- Notifications: fetching unread by user
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id) WHERE read_at IS NULL;

-- Analytics events: heaviest table at scale
CREATE INDEX IF NOT EXISTS idx_analytics_vendor_created ON public.analytics_events(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON public.analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_product ON public.analytics_events(product_id) WHERE product_id IS NOT NULL;

-- Activity logs
CREATE INDEX IF NOT EXISTS idx_activity_company_created ON public.activity_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_company_created ON public.admin_activity_log(company_id, created_at DESC);

-- Loyalty
CREATE INDEX IF NOT EXISTS idx_loyalty_user_created ON public.loyalty_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_company_created ON public.loyalty_transactions(company_id, created_at DESC);

-- Reviews
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_status ON public.product_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_reviews_company_created ON public.product_reviews(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_reviews_company_status ON public.vendor_reviews(company_id, status);

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inventory_levels_company_product ON public.inventory_levels(company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_created ON public.inventory_movements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id, created_at DESC);

-- Profiles: vendor-customer lookup
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id) WHERE company_id IS NOT NULL;

-- User roles
CREATE INDEX IF NOT EXISTS idx_user_roles_company_role ON public.user_roles(company_id, role) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);

-- Product images
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id, position);

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_company_subs_company ON public.company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_company_created ON public.subscription_invoices(company_id, created_at DESC);


-- ============================================
-- 2. PLAN LIMITS ENFORCEMENT (DB-level)
-- ============================================

-- Helper: get active plan limits for a company
CREATE OR REPLACE FUNCTION public.get_company_plan_limits(_company_id uuid)
RETURNS TABLE(max_products integer, max_clients integer, max_users integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.max_products, sp.max_clients, sp.max_users
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = _company_id
    AND cs.status IN ('trial', 'active')
  ORDER BY cs.created_at DESC
  LIMIT 1;
$$;

-- Trigger function: enforce max_products
CREATE OR REPLACE FUNCTION public.enforce_products_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  -- Skip for super admins
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT max_products INTO v_max
  FROM public.get_company_plan_limits(NEW.company_id);

  -- NULL = unlimited
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.products
  WHERE company_id = NEW.company_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_PRODUCTS: لقد وصلت إلى الحد الأقصى من المنتجات (%) في باقتك الحالية. يرجى ترقية الباقة.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_products_limit ON public.products;
CREATE TRIGGER trg_enforce_products_limit
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_products_limit();

-- Trigger function: enforce max_users (vendor team members)
CREATE OR REPLACE FUNCTION public.enforce_users_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Only count staff roles, not customers
  IF NEW.company_id IS NULL OR NEW.role NOT IN ('admin', 'vendor') THEN
    RETURN NEW;
  END IF;

  SELECT max_users INTO v_max
  FROM public.get_company_plan_limits(NEW.company_id);

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_count
  FROM public.user_roles
  WHERE company_id = NEW.company_id
    AND role IN ('admin', 'vendor')
    AND is_enabled = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_USERS: لقد وصلت إلى الحد الأقصى من المستخدمين (%) في باقتك. يرجى ترقية الباقة.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_users_limit ON public.user_roles;
CREATE TRIGGER trg_enforce_users_limit
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_users_limit();

-- Trigger function: enforce max_clients (unique buyers per company)
CREATE OR REPLACE FUNCTION public.enforce_clients_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
  v_already_client boolean;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT max_clients INTO v_max
  FROM public.get_company_plan_limits(NEW.company_id);

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  -- Is this buyer already a client of this company? (existing order)
  SELECT EXISTS(
    SELECT 1 FROM public.orders
    WHERE company_id = NEW.company_id AND buyer_id = NEW.buyer_id
  ) INTO v_already_client;

  IF v_already_client THEN
    RETURN NEW;
  END IF;

  -- Count distinct existing buyers
  SELECT COUNT(DISTINCT buyer_id) INTO v_count
  FROM public.orders
  WHERE company_id = NEW.company_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_CLIENTS: لقد وصلت إلى الحد الأقصى من العملاء (%) في باقتك. يرجى ترقية الباقة.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clients_limit ON public.orders;
CREATE TRIGGER trg_enforce_clients_limit
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_clients_limit();
