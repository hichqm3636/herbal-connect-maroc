/**
 * Arabic labels and lightweight formatters for activity log actions.
 * Keeps the timeline UI free of long switch statements.
 */

export const ACTION_LABELS: Record<string, string> = {
  // Orders
  order_created: "أنشأ الطلب",
  order_updated: "حدّث الطلب",
  order_status_changed: "غيّر حالة الطلب",
  order_supplier_assigned: "عيّن المورد",
  order_supplier_removed: "أزال المورد",
  order_sent_to_supplier: "أرسل الطلب للمورد عبر واتساب",
  order_supplier_confirmation_requested: "طلب التأكيد من المورد عبر واتساب",
  order_admin_notes_updated: "حدّث ملاحظات الإدارة",
  order_invoice_generated: "أصدر الفاتورة",

  // Products
  product_created: "أضاف المنتج",
  product_updated: "حدّث المنتج",
  product_deleted: "حذف المنتج",

  // Company
  company_branding_updated: "حدّث هوية الشركة",
  company_logo_updated: "حدّث شعار الشركة",
  company_logo_removed: "حذف شعار الشركة",

  // Invoices
  invoice_created: "أنشأ الفاتورة",
  invoice_issued: "أصدر الفاتورة",
  invoice_updated: "حدّث الفاتورة",
  invoice_paid: "سجّل دفع الفاتورة",
  invoice_cancelled: "ألغى الفاتورة",
  invoice_pdf_generated: "أنشأ ملف PDF للفاتورة",

  // Partners (suppliers, pharmacies, gyms, etc.)
  partner_created: "أضاف شريكًا",
  partner_invited: "أرسل دعوة لشريك",
  partner_updated: "حدّث بيانات الشريك",
  partner_status_changed: "غيّر حالة الشريك",
  partner_deleted: "حذف الشريك",

  // Distributors
  distributor_created: "أضاف موزعًا",
  distributor_updated: "حدّث بيانات الموزع",
  distributor_activated: "فعّل حساب الموزع",
  distributor_deactivated: "عطّل حساب الموزع",
  distributor_password_reset: "أعاد تعيين كلمة مرور الموزع",
  distributor_pricing_updated: "حدّث تسعير الموزع",
};

export const FIELD_LABELS: Record<string, string> = {
  status: "الحالة",
  supplier_partner_id: "المورد",
  admin_notes: "ملاحظات الإدارة",
  notes: "ملاحظات",
  total_mad: "الإجمالي",
  display_name: "الاسم المعروض",
  brand_color: "لون العلامة",
  logo_url: "الشعار",
  name_ar: "الاسم",
  description_ar: "الوصف",
  price_mad: "السعر",
  stock: "المخزون",
  category: "الفئة",
  active: "نشِط",
  cost_price: "التكلفة",
  rrp_price: "سعر RRP",
  pharmacy_price: "سعر الصيدلية",
  map_price: "سعر MAP",
  minimum_order: "الحد الأدنى",
  pack_size: "حجم العبوة",
  points_per_unit: "النقاط لكل وحدة",
  low_stock_threshold: "حد المخزون المنخفض",
};

export function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function labelForField(field: string | null | undefined): string {
  if (!field) return "";
  return FIELD_LABELS[field] ?? field;
}

export function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  if (typeof v === "number") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  } catch {
    return String(v);
  }
}

export function timeAgoAr(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar-MA");
}
