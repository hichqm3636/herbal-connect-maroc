CREATE OR REPLACE FUNCTION public.enforce_notification_dedupe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      extensions.digest(
        (NEW.kind || '|' || NEW.recipient_id::text || '|' || _entity || '|' || _state)::text,
        'sha1'::text
      ),
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
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;