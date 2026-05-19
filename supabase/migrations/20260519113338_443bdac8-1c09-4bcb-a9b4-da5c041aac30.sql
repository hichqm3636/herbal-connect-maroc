
-- 1) Add dedupe_key column
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON public.notifications (recipient_id, dedupe_key, created_at DESC)
  WHERE dedupe_key IS NOT NULL;

-- 2) BEFORE INSERT guard: compute fingerprint + skip near-duplicates within 60s.
CREATE OR REPLACE FUNCTION public.enforce_notification_dedupe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _entity text;
  _state  text;
  _exists uuid;
BEGIN
  IF NEW.dedupe_key IS NULL OR NEW.dedupe_key = '' THEN
    _entity := COALESCE(
      NEW.metadata->>'order_id',
      NEW.metadata->>'invoice_id',
      NEW.metadata->>'payment_id',
      ''
    );
    _state := COALESCE(
      NEW.metadata->>'after',
      NEW.metadata->>'status',
      ''
    );
    NEW.dedupe_key := encode(
      digest(NEW.kind || '|' || NEW.recipient_id::text || '|' || _entity || '|' || _state, 'sha1'),
      'hex'
    );
  END IF;

  SELECT id INTO _exists
  FROM public.notifications
  WHERE recipient_id = NEW.recipient_id
    AND dedupe_key   = NEW.dedupe_key
    AND created_at   > now() - interval '60 seconds'
  LIMIT 1;

  IF _exists IS NOT NULL THEN
    RETURN NULL; -- silently skip duplicate
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_notification_dedupe ON public.notifications;
CREATE TRIGGER trg_enforce_notification_dedupe
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_dedupe();

-- 3) Backfill dedupe_key for existing rows (best-effort fingerprint)
UPDATE public.notifications
SET dedupe_key = encode(
  digest(
    kind || '|' || recipient_id::text || '|' ||
    COALESCE(metadata->>'order_id', metadata->>'invoice_id', metadata->>'payment_id', id::text) || '|' ||
    COALESCE(metadata->>'after', metadata->>'status', ''),
    'sha1'
  ), 'hex')
WHERE dedupe_key IS NULL;
