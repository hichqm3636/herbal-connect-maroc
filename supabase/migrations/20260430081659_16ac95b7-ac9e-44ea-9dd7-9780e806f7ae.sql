
-- Improve in-app notification copy: include vendor name, clearer action-oriented text
CREATE OR REPLACE FUNCTION public.notify_buyer_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  status_label text;
  body_text text;
  vendor_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), NULLIF(trim(name), ''), 'البائع')
    INTO vendor_name
  FROM public.companies WHERE id = NEW.company_id;

  status_label := CASE NEW.status
    WHEN 'pending'    THEN 'قيد الانتظار'
    WHEN 'confirmed'  THEN 'مؤكد'
    WHEN 'processing' THEN 'قيد المعالجة'
    WHEN 'preparing'  THEN 'قيد التحضير'
    WHEN 'shipped'    THEN 'تم الشحن'
    WHEN 'delivered'  THEN 'تم التسليم'
    WHEN 'cancelled'  THEN 'ملغي'
    ELSE NEW.status::text
  END;

  body_text := CASE NEW.status
    WHEN 'confirmed'  THEN '✅ تم تأكيد طلبك من ' || vendor_name || ' — سيبدأ التحضير قريباً.'
    WHEN 'preparing'  THEN '📦 ' || vendor_name || ' يحضّر طلبك الآن.'
    WHEN 'shipped'    THEN '🚚 طلبك في الطريق إليك من ' || vendor_name || '. اضغط للتتبع.'
    WHEN 'delivered'  THEN '🎉 تم تسليم طلبك. شكراً لتعاملك مع ' || vendor_name || '!'
    WHEN 'cancelled'  THEN '❌ تم إلغاء طلبك من ' || vendor_name || '. تواصل معهم للتفاصيل.'
    ELSE 'تم تحديث حالة طلبك إلى: ' || status_label
  END;

  INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
  VALUES (
    NEW.company_id, NEW.buyer_id, 'order_status_changed',
    'طلب ' || NEW.order_number || ' — ' || status_label,
    body_text,
    '/orders?focus=' || NEW.id,
    jsonb_build_object(
      'order_id', NEW.id,
      'order_number', NEW.order_number,
      'before', OLD.status,
      'after', NEW.status,
      'vendor_name', vendor_name
    )
  );
  RETURN NEW;
END;
$function$;

-- Improve "new order" copy for vendor
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE partner_name text; admin_row record;
BEGIN
  SELECT COALESCE(NULLIF(trim(full_name), ''), 'عميل') INTO partner_name
  FROM public.profiles WHERE id = NEW.buyer_id;

  FOR admin_row IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role IN ('admin'::app_role, 'vendor'::app_role)
      AND ur.company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id, admin_row.user_id, 'order_created',
      '🛒 طلب جديد ' || NEW.order_number,
      'من ' || partner_name || ' بقيمة ' || to_char(NEW.total_mad, 'FM999G999G990D00') || ' MAD — اضغط لمراجعته وتأكيده.',
      '/vendor/orders?focus=' || NEW.id,
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number,
        'total_mad', NEW.total_mad, 'buyer_id', NEW.buyer_id, 'buyer_name', partner_name)
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Improve WhatsApp messages: cleaner format, full URL for the link
CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_from_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ord record;
  msg text;
  base_url text := 'https://herbal-connect-maroc.lovable.app';
  order_id uuid;
BEGIN
  order_id := NULLIF(NEW.metadata->>'order_id','')::uuid;
  IF order_id IS NULL THEN RETURN NEW; END IF;

  SELECT
    o.id, o.order_number, o.total_mad, o.company_id,
    bp.phone AS buyer_phone, bp.full_name AS buyer_name,
    vp.phone AS vendor_phone,
    COALESCE(NULLIF(trim(c.display_name),''), NULLIF(trim(c.name),''), 'البائع') AS vendor_name
  INTO ord
  FROM public.orders o
  LEFT JOIN public.profiles bp ON bp.id = o.buyer_id
  LEFT JOIN public.companies c ON c.id = o.company_id
  LEFT JOIN public.user_roles ur
        ON ur.company_id = o.company_id
       AND ur.role IN ('admin'::app_role, 'vendor'::app_role)
  LEFT JOIN public.profiles vp ON vp.id = ur.user_id
  WHERE o.id = order_id
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.kind = 'order_created' THEN
    IF ord.vendor_phone IS NOT NULL THEN
      msg := '🛒 *طلب جديد* ' || ord.order_number || E'\n\n' ||
             'من: ' || COALESCE(ord.buyer_name,'عميل') || E'\n' ||
             'القيمة: *' || to_char(ord.total_mad,'FM999G999G990D00') || ' MAD*' || E'\n\n' ||
             'افتح وراجع الطلب:' || E'\n' || base_url || '/vendor/orders?focus=' || ord.id;
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'vendor', NEW.recipient_id, ord.vendor_phone, NEW.kind, msg, NEW.metadata);
    END IF;

  ELSIF NEW.kind = 'order_status_changed' THEN
    IF ord.buyer_phone IS NOT NULL THEN
      msg := '📦 *طلبك ' || ord.order_number || '*' || E'\n\n' ||
             COALESCE(NEW.body, NEW.title) || E'\n\n' ||
             'تابع الحالة:' || E'\n' || base_url || '/orders?focus=' || ord.id;
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'client', NEW.recipient_id, ord.buyer_phone, NEW.kind, msg, NEW.metadata);
    END IF;

  ELSIF NEW.kind = 'payment_status_changed' THEN
    IF ord.buyer_phone IS NOT NULL THEN
      msg := '💳 *' || NEW.title || '*' || E'\n\n' ||
             COALESCE(NEW.body,'') || E'\n\n' ||
             'افتح الطلب:' || E'\n' || base_url || '/orders?focus=' || ord.id;
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'client', NEW.recipient_id, ord.buyer_phone, NEW.kind, msg, NEW.metadata);
    END IF;

  ELSIF NEW.kind = 'payment_awaiting_confirmation' THEN
    IF ord.vendor_phone IS NOT NULL THEN
      msg := '💰 *دفع بانتظار التأكيد*' || E'\n\n' ||
             'طلب: ' || ord.order_number || E'\n' ||
             'من: ' || COALESCE(ord.buyer_name,'عميل') || E'\n' ||
             'القيمة: *' || to_char(ord.total_mad,'FM999G999G990D00') || ' MAD*' || E'\n' ||
             COALESCE('مرجع التحويل: ' || (NEW.metadata->>'payment_reference') || E'\n','') || E'\n' ||
             'تحقق من التحويل وأكّده:' || E'\n' || base_url || '/vendor/orders?focus=' || ord.id;
      INSERT INTO whatsapp_outbox (company_id, notification_id, recipient_role, recipient_user_id, phone, kind, message, metadata)
      VALUES (ord.company_id, NEW.id, 'vendor', NEW.recipient_id, ord.vendor_phone, NEW.kind, msg, NEW.metadata);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
