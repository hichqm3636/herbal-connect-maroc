
-- 1) notify_admins_on_new_order (orders INSERT)
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE partner_name text; admin_row record;
BEGIN
  SELECT COALESCE(NULLIF(trim(full_name), ''), 'شريك') INTO partner_name
  FROM public.profiles WHERE id = NEW.buyer_id;

  FOR admin_row IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role IN ('admin'::app_role, 'vendor'::app_role)
      AND ur.company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id, admin_row.user_id, 'order_created',
      'طلب جديد ' || NEW.order_number,
      'من ' || partner_name || ' بقيمة ' || to_char(NEW.total_mad, 'FM999G999G990D00') || ' MAD',
      '/vendor/orders?focus=' || NEW.id,
      jsonb_build_object(
        'source', 'notify_admins_on_new_order',
        'order_id', NEW.id, 'order_number', NEW.order_number,
        'total_mad', NEW.total_mad, 'buyer_id', NEW.buyer_id
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- 2) notify_buyer_on_status_change (orders UPDATE OF status)
CREATE OR REPLACE FUNCTION public.notify_buyer_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE status_label text; body_text text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  status_label := CASE NEW.status
    WHEN 'pending'    THEN 'قيد الانتظار'
    WHEN 'confirmed'  THEN 'تمت الموافقة'
    WHEN 'processing' THEN 'قيد التحضير'
    WHEN 'preparing'  THEN 'قيد التحضير'
    WHEN 'shipped'    THEN 'تم الشحن'
    WHEN 'delivered'  THEN 'تم التسليم'
    WHEN 'cancelled'  THEN 'ملغي'
    ELSE NEW.status::text
  END;

  body_text := CASE NEW.status
    WHEN 'confirmed' THEN 'تم تأكيد طلبك وسيتم تحضيره قريباً.'
    WHEN 'shipped'   THEN 'تم شحن طلبك.'
    WHEN 'delivered' THEN 'تم تسليم طلبك بنجاح.'
    WHEN 'cancelled' THEN 'تم إلغاء طلبك.'
    ELSE 'تم تحديث حالة طلبك إلى: ' || status_label
  END;

  INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
  VALUES (
    NEW.company_id, NEW.buyer_id, 'order_status_changed',
    'طلب ' || NEW.order_number || ' — ' || status_label,
    body_text,
    '/orders?focus=' || NEW.id,
    jsonb_build_object(
      'source', 'notify_buyer_on_status_change',
      'order_id', NEW.id, 'order_number', NEW.order_number,
      'before', OLD.status, 'after', NEW.status
    )
  );
  RETURN NEW;
END;
$$;

-- 3) notify_on_payment_status_change (orders UPDATE OF payment_status)
CREATE OR REPLACE FUNCTION public.notify_on_payment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay_label text; buyer_body text; admin_row record; buyer_name text;
BEGIN
  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN RETURN NEW; END IF;

  pay_label := CASE NEW.payment_status
    WHEN 'pending'                THEN 'بانتظار الدفع'
    WHEN 'awaiting_confirmation'  THEN 'بانتظار التأكيد'
    WHEN 'paid'                   THEN 'مدفوع'
    WHEN 'failed'                 THEN 'فشل الدفع'
    WHEN 'refunded'               THEN 'مُسترد'
    ELSE NEW.payment_status::text
  END;

  buyer_body := CASE NEW.payment_status
    WHEN 'paid'                   THEN 'تم تأكيد دفعك بنجاح.'
    WHEN 'failed'                 THEN 'فشل تسجيل الدفع. يرجى التواصل مع البائع.'
    WHEN 'refunded'               THEN 'تم استرجاع المبلغ.'
    WHEN 'awaiting_confirmation'  THEN 'تم استلام معلومات الدفع، بانتظار التأكيد.'
    ELSE 'تم تحديث حالة الدفع إلى: ' || pay_label
  END;

  INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
  VALUES (
    NEW.company_id, NEW.buyer_id, 'payment_status_changed',
    'دفع طلب ' || NEW.order_number || ' — ' || pay_label,
    buyer_body,
    '/orders?focus=' || NEW.id,
    jsonb_build_object(
      'source', 'notify_on_payment_status_change:buyer',
      'order_id', NEW.id, 'order_number', NEW.order_number,
      'before', OLD.payment_status, 'after', NEW.payment_status,
      'payment_method', NEW.payment_method, 'total_mad', NEW.total_mad
    )
  );

  IF NEW.payment_status = 'awaiting_confirmation' THEN
    SELECT COALESCE(NULLIF(trim(full_name), ''), 'عميل') INTO buyer_name
    FROM public.profiles WHERE id = NEW.buyer_id;

    FOR admin_row IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('admin'::app_role, 'vendor'::app_role)
        AND ur.company_id = NEW.company_id
    LOOP
      INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
      VALUES (
        NEW.company_id, admin_row.user_id, 'payment_awaiting_confirmation',
        'دفع بانتظار التأكيد — ' || NEW.order_number,
        'العميل ' || buyer_name || ' أرسل دفعة بقيمة ' || to_char(NEW.total_mad, 'FM999G999G990D00') || ' MAD',
        '/vendor/orders?focus=' || NEW.id,
        jsonb_build_object(
          'source', 'notify_on_payment_status_change:admin',
          'order_id', NEW.id, 'order_number', NEW.order_number,
          'buyer_id', NEW.buyer_id, 'payment_reference', NEW.payment_reference,
          'total_mad', NEW.total_mad
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) notify_admin_on_payment_proof (invoices UPDATE OF payment_proof_url)
CREATE OR REPLACE FUNCTION public.notify_admin_on_payment_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_row record; buyer_name text;
BEGIN
  IF NEW.payment_proof_url IS NULL OR NEW.payment_proof_url = '' THEN RETURN NEW; END IF;
  IF OLD.payment_proof_url IS NOT DISTINCT FROM NEW.payment_proof_url THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(trim(full_name),''),'عميل') INTO buyer_name
  FROM public.profiles WHERE id = NEW.buyer_id;

  FOR admin_row IN
    SELECT user_id FROM public.user_roles
    WHERE role IN ('admin'::app_role,'vendor'::app_role)
      AND company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id, admin_row.user_id, 'payment_proof_uploaded',
      'إيصال دفع جديد — ' || NEW.invoice_number,
      'العميل ' || buyer_name || ' رفع إيصال دفع بقيمة ' || to_char(NEW.total_mad,'FM999G999G990D00') || ' MAD',
      '/vendor/invoices?focus=' || NEW.id,
      jsonb_build_object(
        'source', 'notify_admin_on_payment_proof',
        'invoice_id', NEW.id, 'invoice_number', NEW.invoice_number,
        'total_mad', NEW.total_mad, 'buyer_id', NEW.buyer_id,
        'payment_proof_url', NEW.payment_proof_url
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;
