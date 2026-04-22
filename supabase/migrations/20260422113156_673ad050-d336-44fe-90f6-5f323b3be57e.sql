-- ============================================================================
-- Operational launch hardening — Free plan + In-app notifications
-- ============================================================================

-- 1) FREE PLAN: ensure a "Free" subscription plan row exists.
INSERT INTO public.subscription_plans (name, monthly_price, currency, active, features, max_users, max_clients, max_products)
SELECT 'Free', 0, 'MAD', true,
       '{"tier":"free","operational_launch":true}'::jsonb,
       NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE lower(name) = 'free');

-- 2) Backfill: every existing company without a subscription gets the active Free plan.
INSERT INTO public.company_subscriptions (company_id, plan_id, status, started_at)
SELECT c.id, p.id, 'active', now()
FROM public.companies c
CROSS JOIN LATERAL (SELECT id FROM public.subscription_plans WHERE lower(name) = 'free' LIMIT 1) p
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_subscriptions s WHERE s.company_id = c.id
);

-- 3) Trigger: auto-attach the Free plan whenever a new company is created.
CREATE OR REPLACE FUNCTION public.attach_free_subscription_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan uuid;
BEGIN
  SELECT id INTO free_plan FROM public.subscription_plans WHERE lower(name) = 'free' LIMIT 1;
  IF free_plan IS NULL THEN
    -- Defensive: don't block company creation if Free plan is missing.
    RETURN NEW;
  END IF;
  INSERT INTO public.company_subscriptions (company_id, plan_id, status, started_at)
  VALUES (NEW.id, free_plan, 'active', now())
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attach_free_subscription ON public.companies;
CREATE TRIGGER trg_attach_free_subscription
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.attach_free_subscription_on_company();

-- ============================================================================
-- 4) NOTIFICATIONS table — in-app only, scoped to a company recipient.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,                         -- auth.users.id of the recipient
  kind text NOT NULL,                                 -- e.g. 'order_created', 'order_status_changed'
  title text NOT NULL,
  body text,
  link text,                                          -- optional in-app URL
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company_created
  ON public.notifications (company_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients view own notifications" ON public.notifications;
CREATE POLICY "Recipients view own notifications"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Recipients mark own notifications" ON public.notifications;
CREATE POLICY "Recipients mark own notifications"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "System and admins create notifications" ON public.notifications;
CREATE POLICY "System and admins create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- 5) Trigger: when a new order is created, notify every company admin.
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_name text;
  admin_row record;
BEGIN
  SELECT COALESCE(NULLIF(trim(full_name), ''), 'شريك') INTO partner_name
  FROM public.profiles WHERE id = NEW.distributor_id;

  FOR admin_row IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin' AND ur.company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id,
      admin_row.user_id,
      'order_created',
      'طلب جديد ' || NEW.order_number,
      'من ' || partner_name || ' بقيمة ' || to_char(NEW.total_mad, 'FM999G999G990D00') || ' MAD',
      '/admin/orders/' || NEW.id,
      jsonb_build_object(
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'total_mad', NEW.total_mad,
        'distributor_id', NEW.distributor_id
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_new_order ON public.orders;
CREATE TRIGGER trg_notify_admins_on_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_new_order();

-- 6) Realtime: stream notifications to admins.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;