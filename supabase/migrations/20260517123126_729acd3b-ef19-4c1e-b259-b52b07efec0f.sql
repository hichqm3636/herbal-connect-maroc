
-- 1) Drop direct client INSERT access
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

-- (No new INSERT policy is created. Inserts now happen exclusively via the
-- server-side ingestion function using the service role, which bypasses RLS.)

-- 2) Audit table for rejected events
CREATE TABLE IF NOT EXISTS public.analytics_rejections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason      text NOT NULL,
  event_name  text,
  user_id     uuid,
  ip_hash     text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_rejections_created
  ON public.analytics_rejections (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_rejections_reason
  ON public.analytics_rejections (reason, created_at DESC);

ALTER TABLE public.analytics_rejections ENABLE ROW LEVEL SECURITY;

-- Only super admins may read rejection audit log
CREATE POLICY "Super admins read analytics rejections"
  ON public.analytics_rejections
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies: only service-role server code writes here.
REVOKE INSERT, UPDATE, DELETE ON public.analytics_rejections FROM anon, authenticated, PUBLIC;
