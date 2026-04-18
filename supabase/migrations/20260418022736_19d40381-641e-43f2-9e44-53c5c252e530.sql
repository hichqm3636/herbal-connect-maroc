CREATE TABLE public.quick_order_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_order_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own templates"
  ON public.quick_order_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own templates"
  ON public.quick_order_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own templates"
  ON public.quick_order_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own templates"
  ON public.quick_order_templates FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_quick_order_templates_user ON public.quick_order_templates(user_id, updated_at DESC);

CREATE TRIGGER update_quick_order_templates_updated_at
  BEFORE UPDATE ON public.quick_order_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();