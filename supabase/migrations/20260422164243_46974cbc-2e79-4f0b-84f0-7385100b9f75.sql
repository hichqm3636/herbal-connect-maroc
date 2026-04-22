-- Create activity_logs table for audit trail
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_activity_logs_company_id ON public.activity_logs(company_id);
CREATE INDEX idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Company members can view logs for their own company
CREATE POLICY "View activity logs in company"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id())
  );

-- Authenticated users belonging to the company can insert logs
CREATE POLICY "Insert activity logs in company"
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.current_company_id()
      AND (user_id IS NULL OR user_id = auth.uid())
    )
  );

-- No UPDATE or DELETE policies → audit trail is immutable