-- ============================================================
-- Pilot Hardening — Minimal Internal Alerting Layer
-- ============================================================
-- Adds:
--   1. public.system_alerts (super_admin readable)
--   2. public.check_operational_health() — dedup-protected
--   3. pg_cron schedule every 15 minutes
-- Nothing else changes. No production data touched.
-- ============================================================

-- 1. system_alerts table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('info','warning','critical')),
  message     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at
  ON public.system_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_kind_unresolved
  ON public.system_alerts (kind, severity)
  WHERE resolved_at IS NULL;

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin reads system alerts" ON public.system_alerts;
CREATE POLICY "super_admin reads system alerts"
  ON public.system_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "super_admin updates system alerts" ON public.system_alerts;
CREATE POLICY "super_admin updates system alerts"
  ON public.system_alerts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "super_admin deletes system alerts" ON public.system_alerts;
CREATE POLICY "super_admin deletes system alerts"
  ON public.system_alerts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- No INSERT policy: only the SECURITY DEFINER health function may write.

-- 2. Health-check function ----------------------------------------------
CREATE OR REPLACE FUNCTION public.check_operational_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errors_15min   integer;
  v_stuck_invoices integer;
  v_stuck_orders   integer;
  v_dedup_window   interval := interval '1 hour';
BEGIN
  -- ---- error log spike ---------------------------------------------------
  SELECT count(*) INTO v_errors_15min
  FROM public.client_error_logs
  WHERE created_at > now() - interval '15 minutes';

  IF v_errors_15min > 100 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.system_alerts
      WHERE kind = 'client_error_spike'
        AND severity = 'critical'
        AND created_at > now() - v_dedup_window
    ) THEN
      INSERT INTO public.system_alerts (kind, severity, message, details)
      VALUES (
        'client_error_spike','critical',
        format('Critical: %s frontend errors logged in the last 15 minutes', v_errors_15min),
        jsonb_build_object('count', v_errors_15min, 'window_minutes', 15)
      );
    END IF;
  ELSIF v_errors_15min > 20 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.system_alerts
      WHERE kind = 'client_error_spike'
        AND severity = 'warning'
        AND created_at > now() - v_dedup_window
    ) THEN
      INSERT INTO public.system_alerts (kind, severity, message, details)
      VALUES (
        'client_error_spike','warning',
        format('Warning: %s frontend errors logged in the last 15 minutes', v_errors_15min),
        jsonb_build_object('count', v_errors_15min, 'window_minutes', 15)
      );
    END IF;
  END IF;

  -- ---- invoices stuck issued > 7 days ------------------------------------
  SELECT count(*) INTO v_stuck_invoices
  FROM public.invoices
  WHERE status = 'issued'
    AND created_at < now() - interval '7 days';

  IF v_stuck_invoices > 5 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.system_alerts
      WHERE kind = 'invoices_stuck_unpaid'
        AND severity = 'warning'
        AND created_at > now() - v_dedup_window
    ) THEN
      INSERT INTO public.system_alerts (kind, severity, message, details)
      VALUES (
        'invoices_stuck_unpaid','warning',
        format('%s invoices remain unpaid for more than 7 days', v_stuck_invoices),
        jsonb_build_object('count', v_stuck_invoices, 'age_days', 7)
      );
    END IF;
  END IF;

  -- ---- orders stuck pending > 48 hours -----------------------------------
  SELECT count(*) INTO v_stuck_orders
  FROM public.orders
  WHERE status = 'pending'
    AND created_at < now() - interval '48 hours';

  IF v_stuck_orders > 10 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.system_alerts
      WHERE kind = 'orders_stuck_pending'
        AND severity = 'warning'
        AND created_at > now() - v_dedup_window
    ) THEN
      INSERT INTO public.system_alerts (kind, severity, message, details)
      VALUES (
        'orders_stuck_pending','warning',
        format('%s orders stuck in pending for more than 48 hours', v_stuck_orders),
        jsonb_build_object('count', v_stuck_orders, 'age_hours', 48)
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_operational_health() FROM PUBLIC, anon, authenticated;

-- 3. Schedule via pg_cron (every 15 min) --------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  -- Remove any prior schedule with the same name before re-adding.
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'check_operational_health_every_15min';
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not yet ready or jobname column shape differs; ignore.
  NULL;
END $$;

SELECT cron.schedule(
  'check_operational_health_every_15min',
  '*/15 * * * *',
  $$SELECT public.check_operational_health();$$
);