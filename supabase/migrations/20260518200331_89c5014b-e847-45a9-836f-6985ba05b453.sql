
CREATE TABLE public.client_error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  message text NOT NULL,
  stack text,
  url text,
  user_agent text,
  route text,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('error','warning','info')),
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_error_logs_created_at ON public.client_error_logs (created_at DESC);
CREATE INDEX idx_client_error_logs_company ON public.client_error_logs (company_id, created_at DESC);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can insert their own error report. No selects for non-admins.
CREATE POLICY "anyone can insert error logs"
ON public.client_error_logs FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Only super_admin can read.
CREATE POLICY "super_admin reads error logs"
ON public.client_error_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Only super_admin can delete (for retention).
CREATE POLICY "super_admin deletes error logs"
ON public.client_error_logs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));
