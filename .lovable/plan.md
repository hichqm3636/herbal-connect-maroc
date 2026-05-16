# Nexora — Architecture Remediation Plan

خطة إصلاح هندسية مبنية على نتائج Technical Audit. الهدف: استقرار + أمان + جاهزية للتوسع قبل تجاوز 20 موزع نشط. **بدون أي Feature جديدة.**

---

## 1. مبادئ التنفيذ

- **No new features** خلال فترة الـ Remediation (≈ 4–6 أسابيع).
- كل Sprint = أسبوعان، ينتهي بـ Regression test + Security re-scan.
- أي تغيير على RLS أو Auth يمر عبر `scripts/audit-tenant-rls.mjs` + Playwright multi-tenant suite.
- Migrations فقط عبر `supabase--migration` (ممنوع SQL يدوي على الإنتاج).
- كل Refactor كبير خلف Feature Flag حتى التحقق.

---

## 2. ترتيب الإصلاحات حسب الأولوية

| # | المشكلة | الخطورة | Sprint |
|---|---------|---------|--------|
| 1 | Service Role Key قابل للتسريب من ملفات `*.functions.ts` غير نقية | Critical | 1 |
| 2 | `TenantProvider` يعتمد على `window.location` فقط (لا تحقق Server-side) | Critical | 1 |
| 3 | غياب CSP / HSTS / X-Frame headers | High | 1 |
| 4 | Edge Functions قديمة (`create-distributor`, `generate-invoice-pdf`, `send-invoice-email`, `send-whatsapp`) متوازية مع Server Functions | High | 1–2 |
| 5 | 141 Migration غير مدمجة → بطء CI + خطر استرجاع | High | 2 |
| 6 | غياب Composite Indexes على `(company_id, …)` لأغلب جداول RLS | High | 2 |
| 7 | 118 SECURITY DEFINER function بدون مراجعة صلاحيات | High | 2 |
| 8 | PDF Generation متزامن داخل Request (blocking) | Mid | 3 |
| 9 | غياب Rate Limiting على `/api/public/woo-webhook` و auth endpoints | Mid | 3 |
| 10 | Realtime غير مفعّل/غير محكوم على جداول الإشعارات والطلبات | Mid | 3 |
| 11 | غياب Observability (logs مهيكلة، error tracking، uptime) | Mid | 3 |
| 12 | Test coverage ضعيف لـ Multi-tenant (لا E2E منتظم) | Mid | 4 |
| 13 | Bundle size + Code splitting للراوتات الثقيلة (super-admin) | Low | 4 |
| 14 | تنظيف `routeTree.gen.ts` المُعدَّل يدوياً + توحيد الـ routing | Low | 4 |

---

## 3. خارطة الـ Sprints

### Sprint 1 — Security Hardening (أسبوعان) — الأخطر
**هدف:** سدّ ثغرات قد تؤدي لتسريب بيانات بين المستأجرين أو كشف Service Role.

- **S1.1** فحص كل `src/**/*.functions.ts` و `src/server/*` لاستخراج أي import لـ `client.server` خارج ملفات handler نقية. نقل أي helper مساعد إلى `*.server.ts` منفصل.
- **S1.2** إضافة Server-side tenant resolver: serverFn `resolveTenant({host})` يُستخدم في `beforeLoad` لكل route تابع لـ tenant بدلاً من الاعتماد على `useTenant()` فقط.
- **S1.3** إضافة Security Headers في `src/routes/__root.tsx` (head) + إعداد `wrangler.jsonc` Response headers: CSP، HSTS، X-Content-Type-Options، Referrer-Policy، Permissions-Policy.
- **S1.4** مراجعة policies `analytics_events` و `companies` (انتباه: `Public can browse vendor directory` يكشف `payment_instructions` و `contact_email`) — حصر الأعمدة المكشوفة عبر View عام مخصص.
- **S1.5** تشغيل `audit-tenant-rls.mjs` وإصلاح كل Warning قبل قفل Sprint.

**مخاطر:** CSP صارمة قد تكسر Lovable preview → نبدأ بـ `Content-Security-Policy-Report-Only` لمدة 3 أيام.

### Sprint 2 — Database & Authorization Cleanup
**هدف:** قاعدة بيانات قابلة للصيانة وأداء RLS مقبول حتى 100 موزع.

- **S2.1** Squash لـ 141 migration إلى baseline واحد + الاحتفاظ بآخر 20 كـ delta. (ينفذ على فرع منفصل + استرجاع من snapshot للتحقق).
- **S2.2** إضافة Composite Indexes:
  - `products(company_id, active)`
  - `orders(company_id, created_at desc)`
  - `order_items(order_id)`
  - `notifications(recipient_id, read_at)`
  - `analytics_events(vendor_id, created_at)`
- **S2.3** Audit لـ `SECURITY DEFINER` functions: تصنيفها (Safe / Needs review / To drop)، إضافة `SET search_path = public` لكل ما ينقصه.
- **S2.4** ترحيل `create-distributor` Edge Function إلى `createServerFn` مع `requireSupabaseAuth` + super_admin check.
- **S2.5** تجميد schema بـ snapshot test (`pg_dump --schema-only` يُقارن في CI).

**مخاطر:** Squash قد يكسر تتبع التاريخ → إجراء على staging أولاً مع نسخة كاملة.

### Sprint 3 — Performance & Resilience
**هدف:** إزالة العمليات الحاجبة وإضافة طبقة مراقبة.

- **S3.1** نقل `generate-invoice-pdf` إلى نمط Async:
  - serverFn يُنشئ سجل `invoice_jobs(status=queued)` ويعيد فوراً.
  - PDF يولَّد client-side (jsPDF) أو عبر job يُحمّله Storage bucket.
- **S3.2** إضافة Rate limiting على `/api/public/woo-webhook` (in-memory token bucket per supplier_id) + التحقق من HMAC موجود مسبقاً.
- **S3.3** Rate limit + brute-force lockout على `/control` (super admin) عبر `super_admin_login_attempts` (الجدول موجود لكن غير مستغل).
- **S3.4** تفعيل Realtime فقط لـ `notifications` و `orders` مع publication مخصص (تجنب broadcast عام).
- **S3.5** Observability: Sentry/PostHog client + serverFn error middleware يرسل breadcrumb موحّد + structured logs (`{requestId, companyId, userId}`).

**مخاطر:** PDF client-side قد لا يدعم RTL/Arabic بنفس الجودة → اختبار مبكر؛ بديل: queue + Worker.

### Sprint 4 — Quality & Scale Readiness
**هدف:** تثبيت الجودة قبل فتح الباب لـ onboarding مكثف.

- **S4.1** Playwright Multi-tenant E2E suite (موجودة جزئياً في `e2e/`): تغطي عزل البيانات بين شركتين فعليتين، RBAC للأدوار الثلاثة.
- **S4.2** CI gate: `audit-tenant-rls`, `supabase linter`, `tsc --noEmit`, `vitest run`, Playwright smoke — جميعها blocking.
- **S4.3** Code splitting: تحويل routes تحت `_app/super-admin/*` إلى lazy chunks (موجود router-level لكن نتأكد من حجم bundle < 350KB initial).
- **S4.4** تنظيف `routeTree.gen.ts`: التأكد أنه auto-generated فقط + إزالة أي تعديل يدوي.
- **S4.5** توثيق: `ARCHITECTURE.md` + `RUNBOOK.md` (كيف نطلق Tenant جديد، كيف نعكس migration، كيف نستجيب لحادثة).

**مخاطر:** كتابة E2E يأخذ وقتاً → نبدأ بـ 5 سيناريوهات حرجة فقط.

---

## 4. ما يحتاج Refactor فعلي (وليس Patch)

| المكوّن | السبب | الاتجاه |
|---------|------|---------|
| `useTenant` / `TenantProvider` | يثق بالـ host فقط، DB lookup عبر Anon | تحويل إلى loader-based + serverFn يتحقق من company وصلاحية المستخدم |
| Edge Functions الأربعة | تكرار مع Server Functions، Auth model مختلف | ترحيل كامل إلى `createServerFn` (إبقاء فقط ما يستقبل webhooks خارجية حقيقية) |
| `superAdminGate` (localStorage flag) | قابل للتلاعب من المتصفح | استبدال بـ session claim أو DB check (`super_admin_login_attempts.success` خلال نافذة) |
| `productFetch.functions.ts` + WooCommerce integration | منطق متشعب وغير مختبر | عزل في module مستقل + وحدات اختبار + retry/backoff |
| Folder `supabase/functions/_shared` | يعيد بناء auth context يدوياً | استبداله بـ `requireSupabaseAuth` middleware موحّد |

---

## 5. ما يُؤجَّل صراحة (Out of scope الآن)

- إعادة تصميم UI/UX أو نظام التصميم.
- Feature flags كنظام كامل (نكتفي بـ env-based toggles مؤقتاً).
- Multi-region / Read replicas (لا حاجة قبل > 500 موزع).
- ترحيل عن Supabase أو تغيير ORM.
- i18n إضافي (نبقى عربي/فرنسي حالياً).
- Mobile app / PWA offline mode.
- AI features إضافية (التوصيات الحالية تبقى كما هي).
- Stripe/Paddle integration (مدفوعات subscription تبقى يدوية).

---

## 6. مصفوفة المخاطر الكلية

| الخطر | الاحتمال | الأثر | تخفيف |
|------|----------|------|-------|
| Migration squash يفسد بيانات إنتاج | منخفض | كارثي | تنفيذ على نسخة + snapshot قبل/بعد |
| CSP صارم يكسر OAuth/Lovable preview | متوسط | متوسط | Report-Only أولاً، ثم Enforce |
| ترحيل Edge Function يكسر فواتير قائمة | متوسط | عالي | تشغيل بالتوازي 7 أيام مع feature flag |
| تأخر Sprint 1 يؤجل الباقي | متوسط | عالي | لا new features، نطاق مقفل |
| نقص قدرة الفريق على E2E Playwright | متوسط | متوسط | تركيز على top 5 سيناريوهات فقط |

---

## 7. معايير القبول النهائية (Definition of Done للخطة كاملة)

- 0 خطأ من `audit-tenant-rls.mjs` و `supabase linter`.
- 0 ملف يستورد `client.server` خارج `*.functions.ts` نقي أو `*.server.ts`.
- كل route حساس محمي بـ `beforeLoad` يتحقق من tenant + role server-side.
- Headers: CSP enforced + HSTS + Frame-deny.
- Migrations: ≤ 25 ملف فعّال.
- p95 latency لأكثر 5 endpoints مستعملة < 400ms.
- E2E suite تغطي عزل tenant + RBAC + checkout + webhook.
- Runbook + Architecture docs منشورة.

---

## 8. الجدول الزمني المقترح

```
Week 1-2  : Sprint 1 (Security Hardening)
Week 3-4  : Sprint 2 (DB & Authorization)
Week 5-6  : Sprint 3 (Performance & Resilience)
Week 7-8  : Sprint 4 (Quality & Docs)
Week 9    : Buffer + Production cutover + Post-mortem
```

بعد الموافقة، أبدأ بـ Sprint 1 خطوة-خطوة وأطلب موافقتك قبل كل migration أو تغيير على RLS.
