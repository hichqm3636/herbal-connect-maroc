-- WhatsApp outbox + dispatcher
-- Async, decoupled queue for outbound WhatsApp messages.

CREATE TABLE public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  notification_id uuid,
  recipient_role text NOT NULL CHECK (recipient_role IN ('client','vendor')),
  recipient_user_id uuid,
  phone text NOT NULL,
  kind text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_outbox_pending ON public.whatsapp_outbox (status, next_attempt_at)
  WHERE status IN ('pending','failed');
CREATE INDEX idx_wa_outbox_company ON public.whatsapp_outbox (company_id, created_at DESC);

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View wa outbox in company"
  ON public.whatsapp_outbox FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role)));

CREATE TRIGGER trg_wa_outbox_updated
  BEFORE UPDATE ON public.whatsapp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Phone normaliser (Morocco-friendly: 0XXXXXXXXX -> +212XXXXXXXXX, keeps existing +)
CREATE OR REPLACE FUNCTION public.normalize_phone_ma(_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  digits text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(_raw, '[^0-9+]', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF left(digits, 1) = '+' THEN RETURN digits; END IF;
  IF left(digits, 3) = '212' THEN RETURN '+' || digits; END IF;
  IF left(digits, 1) = '0' AND length(digits) = 10 THEN
    RETURN '+212' || substring(digits FROM 2);
  END IF;
  RETURN '+' || digits;
END;
$$;

-- Enqueue function — reads notification + maps to phone(s) + composes Arabic message
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_from_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_id uuid;
  ord record;
  buyer_phone text;
  vendor_phone text;
  msg text;
BEGIN
  -- Only handle whitelisted kinds
  IF NEW.kind NOT IN ('order_created','order_status_changed','payment_status_changed','payment_awaiting_confirmation') THEN
    RETURN NEW;
  END IF;

  order_id := NULLIF(NEW.metadata->>'order_id','')::uuid;
  IF order_id IS NULL THEN RETURN NEW; END IF;

  SELECT o.id, o.order_number, o.total_mad, o.status, o.payment_status, o.payment_method,
         o.buyer_id, o.company_id,
         normalize_phone_ma(p.phone) AS buyer_phone,
         normalize_phone_ma(c.contact_phone) AS vendor_phone,
         COALESCE(NULLIF(trim(c.display_name),''), c.name) AS company_name
  INTO ord
  FROM orders o
  LEFT JOIN profiles p ON p.id = o.buyer_id
  LEFT JOIN companies c ON c.id = o.company_id
  WHERE o.id = order_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- ROUTING
  IF NEW.kind = 'order_created' THEN
    -- Notify vendor
    IF ord.vendor_phone IS NOT NULL THEN
      msg := '🛒 طلب جديد ' || ord.order_number || E'\n' ||
             'القيمة: ' || to_char(ord.total_mad,'FM999G999G990D00') || ' MAD' || E'\n' ||
             'افتح: /vendor/orders?focus=' || ord.id;
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'vendor', NEW.recipient_id, ord.vendor_phone, NEW.kind, msg, NEW.metadata);
    END IF;

  ELSIF NEW.kind = 'order_status_changed' THEN
    -- Notify buyer
    IF ord.buyer_phone IS NOT NULL THEN
      msg := '📦 طلبك ' || ord.order_number || E'\n' || COALESCE(NEW.body, NEW.title);
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'client', NEW.recipient_id, ord.buyer_phone, NEW.kind, msg, NEW.metadata);
    END IF;

  ELSIF NEW.kind = 'payment_status_changed' THEN
    -- Notify buyer
    IF ord.buyer_phone IS NOT NULL THEN
      msg := '💳 ' || NEW.title || E'\n' || COALESCE(NEW.body,'');
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'client', NEW.recipient_id, ord.buyer_phone, NEW.kind, msg, NEW.metadata);
    END IF;

  ELSIF NEW.kind = 'payment_awaiting_confirmation' THEN
    -- Notify vendor
    IF ord.vendor_phone IS NOT NULL THEN
      msg := '💰 دفع بانتظار التأكيد' || E'\n' ||
             'طلب: ' || ord.order_number || E'\n' ||
             'القيمة: ' || to_char(ord.total_mad,'FM999G999G990D00') || ' MAD' || E'\n' ||
             COALESCE('مرجع: ' || (NEW.metadata->>'payment_reference') || E'\n','') ||
             '/vendor/orders?focus=' || ord.id;
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'vendor', NEW.recipient_id, ord.vendor_phone, NEW.kind, msg, NEW.metadata);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_whatsapp
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_from_notification();

-- Claim function for the worker (atomic batch claim with row locking)
CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox(_limit int DEFAULT 25)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.whatsapp_outbox
    WHERE status IN ('pending','failed')
      AND next_attempt_at <= now()
      AND attempts < 5
    ORDER BY next_attempt_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_outbox o
  SET status = 'sending', attempts = o.attempts + 1, updated_at = now()
  FROM picked
  WHERE o.id = picked.id
  RETURNING o.*;
END;
$$;