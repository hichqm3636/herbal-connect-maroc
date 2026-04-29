-- =========================================================
-- 1. Clean duplicate triggers (keep the trg_* prefixed ones)
-- =========================================================
DROP TRIGGER IF EXISTS set_order_number ON public.orders;
DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;

-- =========================================================
-- 2. Notify the buyer (client) when order status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.notify_buyer_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  status_label text;
  body_text text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

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
    WHEN 'confirmed'  THEN 'تم تأكيد طلبك من البائع.'
    WHEN 'preparing'  THEN 'البائع يحضّر طلبك الآن.'
    WHEN 'shipped'    THEN 'طلبك في الطريق إليك.'
    WHEN 'delivered'  THEN 'تم تسليم طلبك. شكراً لك!'
    WHEN 'cancelled'  THEN 'تم إلغاء طلبك.'
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
      'after', NEW.status
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_buyer_on_status_change ON public.orders;
CREATE TRIGGER trg_notify_buyer_on_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_buyer_on_status_change();

-- =========================================================
-- 3. Notify on payment_status changes (buyer + vendor admins)
-- =========================================================
CREATE OR REPLACE FUNCTION public.notify_on_payment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay_label text;
  buyer_body text;
  admin_row record;
  buyer_name text;
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

  -- 3a. Notify the buyer
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
      'order_id', NEW.id, 'order_number', NEW.order_number,
      'before', OLD.payment_status, 'after', NEW.payment_status,
      'payment_method', NEW.payment_method, 'total_mad', NEW.total_mad
    )
  );

  -- 3b. Notify vendor admins ONLY when buyer marks bank transfer as awaiting confirmation
  -- (other transitions are usually triggered BY the vendor — no need to ping them)
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
          'order_id', NEW.id, 'order_number', NEW.order_number,
          'buyer_id', NEW.buyer_id, 'payment_reference', NEW.payment_reference,
          'total_mad', NEW.total_mad
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_on_payment_status_change ON public.orders;
CREATE TRIGGER trg_notify_on_payment_status_change
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_payment_status_change();

-- =========================================================
-- 4. RLS: allow system triggers (SECURITY DEFINER) AND let the
--    buyer create the awaiting_confirmation notification path.
--    Existing INSERT policy only allows admins → triggers run as
--    SECURITY DEFINER so they're fine, but make the policy explicit.
-- =========================================================
DROP POLICY IF EXISTS "System and admins create notifications" ON public.notifications;
CREATE POLICY "System and admins create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    company_id = current_company_id()
    AND has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Allow recipients to delete their own notifications (cleanup UX)
DROP POLICY IF EXISTS "Recipients delete own notifications" ON public.notifications;
CREATE POLICY "Recipients delete own notifications"
ON public.notifications
FOR DELETE
USING (recipient_id = auth.uid());
