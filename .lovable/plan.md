# Nexora — Phase 1 UX/UI Plan

نطاق هذه المرحلة كبير. سأقسّمه إلى **4 شحنات (PRs)** متتالية حتى نشحن قيمة بسرعة دون كسر شيء، ونراجع بعد كل شحنة. الترتيب يتبع أولوياتك.

---

## Shipment 1 — Vendor Dashboard Redesign (الأولوية القصوى)

الملف الرئيسي: `src/routes/_app/_vendor/vendor.index.tsx` + مكوّنات جديدة في `src/components/vendor/dashboard/`.

### مكوّنات جديدة
- `KpiCard.tsx` — بطاقة KPI احترافية (label, value, delta %, trend sparkline صغير، icon, accent). تستبدل `StatCard` الحالي على Dashboard فقط.
- `KpiGrid.tsx` — شبكة 5 بطاقات: Revenue Today / Orders Today / Pending Orders / New Customers / Best Selling Product.
- `RevenueChart.tsx` — Area chart أسبوعي (آخر 7 أيام) باستخدام `recharts` (مثبت مسبقاً في المشروع).
- `OrdersTrendChart.tsx` — Line/Bar chart للطلبات.
- `TopProductsCard.tsx` — قائمة Top 5 منتجات بالكمية المباعة.
- `QuickInsights.tsx` — 3 رسائل ذكية مولّدة من البيانات: ارتفاع/انخفاض المبيعات vs الأسبوع الماضي، أكثر منتج مبيعاً، تنبيه مخزون منخفض.
- `QuickActionsBar.tsx` — أزرار: Add Product / Create Order / Create Invoice.
- `AiInsightsSlot.tsx` — placeholder بشارة "قريباً" يمهّد لطبقة AI لاحقاً (نقطة 7).

### مصدر البيانات
- استعلام واحد على `orders` (آخر 14 يوم) + `order_items` + `products` لحساب جميع KPIs والـ charts client-side.
- لا حاجة لـ migrations في هذه الشحنة.

### التصميم
- نستخدم tokens موجودة في `src/styles.css` (`--primary`, `--success`, `--warning`, `--info`, `--muted`).
- إضافة `--gradient-primary` و `--shadow-elegant` إن لم تكن موجودة، لإعطاء عمق احترافي بأسلوب Linear/Stripe.

---

## Shipment 2 — Sidebar Architecture

ملف: `src/components/AppSidebar.tsx`.

### إعادة الهيكلة (Vendor فقط — أدوار أخرى تبقى كما هي)
```
Overview
  └── Dashboard
Commerce
  ├── Orders
  ├── Customers
  └── Products
Finance
  ├── Invoices
  └── Payments
Marketing
  ├── Coupons (قريباً)
  └── Reviews
Analytics
  ├── Reports
  └── Insights
Settings
  ├── Team
  ├── Branding
  └── Billing
```

- استخدام `SidebarGroup` + `SidebarGroupLabel` لكل قسم.
- العناصر غير الموجودة (Customers, Coupons) تبقى مخفية أو معطّلة بشارة "قريباً" — لا نُنشئ صفحات وهمية.
- المجموعة التي تحوي الـ active route تبقى مفتوحة (`defaultOpen`).
- تحسين spacing وtypography (أسماء أقسام بحجم `text-[11px] uppercase tracking-wider`).

---

## Shipment 3 — Orders Experience

### Status System
- موحّد عبر `StatusBadge` الموجود (V3 lifecycle: pending → confirmed → preparing → shipped → delivered + cancelled). ألوان واضحة موجودة بالفعل — نتأكد من تطبيقها في كل صفحات Orders.
- "New" في طلبك = `pending`، "Processing" = `preparing`. سنستعمل المسميات العربية الموحدة.

### Orders List (`vendor.orders.tsx`)
- صفوف أكثر كثافة بصرية: avatar/initials للعميل، رقم الطلب bold، شارة status ملوّنة، payment badge، إجمالي MAD، وقت نسبي.
- Tabs أعلى الجدول: الكل / جديدة / قيد التحضير / مشحونة / مسلَّمة / ملغاة (counts).

### Order Details Drawer/Page
- `OrderDetailsSheet.tsx` جديد يفتح من النقر:
  - **Customer Info** (الاسم، الهاتف، العنوان، WhatsApp link).
  - **Timeline** عمودي يعرض تحوّلات الحالة بترتيب زمني (مولّد من `created_at` + `updated_at` + status changes).
  - **Payment Status** بطاقة منفصلة مع `PaymentBadge`.
  - **Items** جدول مع صور.
  - **Notes** عامة + **Internal Comments** للفريق فقط (سنخزّنها في عمود `admin_notes` الموجود — لا migration).

---

## Shipment 4 — Visual Polish + RTL + Mobile

### Visual Hierarchy
- Typography scale أوضح (h1 32/40, h2 24/32, body 14/22).
- Spacing موحّد (`gap-6` بين الأقسام، `p-5` للبطاقات).
- Cards: حدود `border-border/60` + shadow soft + hover elegant.
- Empty states: استخدام `EmptyState` الموجود مع أيقونة كبيرة + CTA واضح.

### RTL
- مراجعة جميع `ml-*` / `mr-*` / `pl-*` / `pr-*` في الملفات المعاد تصميمها واستبدالها بـ `ms-*` / `me-*` / `ps-*` / `pe-*` (logical properties).
- التأكد من اتجاه الـ icons (chevrons) في القوائم.

### Mobile
- Vendor dashboard: KPI grid يتحول إلى scroll أفقي على الموبايل (snap).
- Sidebar: يظل offcanvas على الموبايل عبر `useIsMobile`.
- Orders list: card view على < 768px بدل table.

---

## ما خارج النطاق الآن (متفق مع ملاحظتك "لا ERP معقد")
- بناء نظام Coupons فعلي.
- صفحة Customers مستقلة (سنكتفي بربط من Orders).
- تنفيذ AI Insights — فقط slot جاهز.
- Bottom navigation للموبايل (مذكور كـ "مستقبلًا" في طلبك).

---

## التفاصيل التقنية

- لا migrations في هذه المرحلة. جميع البيانات متوفرة في الجداول الحالية (`orders`, `order_items`, `products`, `profiles`).
- Charts: `recharts` (موجود).
- لا تغيير على RLS أو auth.
- جميع الألوان عبر design tokens في `src/styles.css` — ممنوع hard-coded colors.
- اختبار TypeScript يمر بعد كل شحنة (CI الذي أعددناه يحرس هذا).

---

## ترتيب التنفيذ المقترح

1. **الآن**: Shipment 1 (Dashboard) — أكبر أثر بصري، يطابق أولويتك #1.
2. بعد موافقتك على Shipment 1: Shipment 2 (Sidebar).
3. ثم Shipment 3 (Orders).
4. ثم Shipment 4 (Polish + RTL + Mobile).

---

**هل أبدأ بـ Shipment 1 (Dashboard Redesign) الآن؟** أو تفضّل ترتيباً مختلفاً، أو تعديلات على النطاق؟
