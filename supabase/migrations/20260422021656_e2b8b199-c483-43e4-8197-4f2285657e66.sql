CREATE TABLE public.media_health_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scanned_by uuid,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  total int NOT NULL DEFAULT 0,
  ok_count int NOT NULL DEFAULT 0,
  broken_count int NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX media_health_scans_company_scanned_idx
  ON public.media_health_scans (company_id, scanned_at DESC);

ALTER TABLE public.media_health_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View media scans in company"
  ON public.media_health_scans FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Insert media scans in company"
  ON public.media_health_scans FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Delete media scans in company"
  ON public.media_health_scans FOR DELETE
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );