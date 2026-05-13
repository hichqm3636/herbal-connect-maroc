import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Leaf,
  Building2,
  ArrowLeft,
  Rocket,
  ShoppingBag,
  Store,
  ShieldCheck,
  Truck,
  Package,
  Pill,
  FlaskConical,
  Sparkles,
  Stethoscope,
  CheckCircle2,
  ClipboardList,
  FileText,
  Users,
  TrendingUp,
  LayoutDashboard,
  Search,
  PackageCheck,
  Dumbbell,
  HeartPulse,
  ArrowLeftCircle,
  Menu,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { homeForRole } from "@/lib/roleRouting";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexora — سوق B2B لقطاع الصحة وإدارة الأعمال" },
      {
        name: "description",
        content:
          "Nexora منصة B2B لقطاع الصحة تجمع بين السوق وإدارة الأعمال — اعرض منتجاتك، اطلب بالجملة، ونظّم الفواتير والعملاء من مكان واحد.",
      },
      { property: "og:title", content: "Nexora — سوق B2B لقطاع الصحة" },
      {
        property: "og:description",
        content:
          "اكتشف موردين موثوقين، اعرض منتجاتك، ونظّم الطلبات والفواتير والعملاء من مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Nexora" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Nexora",
          url: "https://nexora.app",
          description:
            "منصة B2B لقطاع الصحة تجمع بين السوق وإدارة الأعمال.",
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading, marketplaceRole } = useAuth();
  const tenant = useTenant();

  if (loading || tenant.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Leaf className="h-7 w-7 text-primary-foreground animate-pulse" />
        </div>
      </div>
    );
  }

  if (tenant.kind === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4" dir="rtl">
        <Card className="w-full max-w-md p-8 text-center shadow-elegant">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <Building2 className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">404 — الشركة غير موجودة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            البوابة <span className="font-mono">{tenant.slug}.nexora.app</span> غير مسجلة على Nexora.
          </p>
          <Button asChild className="mt-6 w-full">
            <a href="https://nexora.app">
              <ArrowLeft className="h-4 w-4" />
              العودة إلى Nexora
            </a>
          </Button>
          <p className="mt-6 text-[11px] text-muted-foreground">Powered by Nexora</p>
        </Card>
      </div>
    );
  }

  if (tenant.kind === "root") {
    return <NexoraLanding isAuthenticated={!!session} />;
  }

  if (tenant.kind === "platform") {
    return <Navigate to={session ? homeForRole(marketplaceRole) : "/login"} />;
  }

  return <Navigate to={session ? homeForRole(marketplaceRole) : "/login"} />;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Landing page                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

interface VendorCard {
  id: string;
  name: string;
  display_name: string;
  logo_url: string | null;
  brand_color: string;
  slug: string;
}

interface ProductCard {
  id: string;
  name: string;
  price: number | null;
  image_url: string | null;
  min_order_quantity: number | null;
  stock_quantity: number | null;
  company: { display_name: string | null; name: string; slug: string } | null;
}

const CATEGORIES = [
  { icon: Pill, label: "أدوية ومستلزمات", desc: "موردون مرخّصون" },
  { icon: FlaskConical, label: "مكملات غذائية", desc: "فيتامينات وبروتين" },
  { icon: Leaf, label: "أعشاب طبية", desc: "تعاونيات ومنتجات طبيعية" },
  { icon: Sparkles, label: "مستحضرات تجميل", desc: "عناية ومستحضرات" },
  { icon: Stethoscope, label: "مستلزمات طبية", desc: "أجهزة وأدوات" },
  { icon: Dumbbell, label: "مستلزمات رياضية", desc: "تجهيزات وأدوات اللياقة" },
];

function NexoraLanding({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [vendors, setVendors] = useState<VendorCard[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [stats, setStats] = useState({ products: 0, vendors: 0, orders: 0 });

  useEffect(() => {
    track("landing_view", { metadata: { authenticated: isAuthenticated } });
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: v }, { data: p }, prodCount, vendorCount, orderCount] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, display_name, logo_url, brand_color, slug")
          .eq("is_listed", true)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("products")
          .select(
            "id, name, price, image_url, min_order_quantity, stock_quantity, company:companies(display_name, name, slug)"
          )
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_listed", true),
        supabase.from("orders").select("id", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      setVendors((v ?? []) as VendorCard[]);
      setVendorsLoading(false);
      setProducts((p ?? []) as unknown as ProductCard[]);
      setProductsLoading(false);
      setStats({
        products: prodCount.count ?? 0,
        vendors: vendorCount.count ?? 0,
        orders: orderCount.count ?? 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <LandingHeader isAuthenticated={isAuthenticated} />
      <Hero />
      <AudienceSection />
      <WhyNexora />
      <HowItWorks />
      <CategoriesSection />
      <TrustedSuppliers vendors={vendors} loading={vendorsLoading} />
      <FeaturedProducts products={products} loading={productsLoading} />
      <StatsSection stats={stats} />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */

function LandingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useState(false);
  const navItems = [
    { href: "#hero", label: "الرئيسية" },
    { href: "#how-it-works", label: "كيف يعمل" },
    { href: "#suppliers", label: "الموردون" },
    { href: "#categories", label: "الفئات" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Leaf className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-extrabold tracking-tight">Nexora</span>
            <span className="hidden text-[10px] text-muted-foreground sm:block">
              سوق B2B لقطاع الصحة
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {navItems.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="transition-colors hover:text-foreground"
              onClick={() =>
                track("landing_nav_click", { metadata: { target: n.href } })
              }
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link
                to="/client"
                onClick={() =>
                  track("landing_cta_click", { metadata: { cta: "header_dashboard" } })
                }
              >
                <LayoutDashboard className="h-4 w-4" />
                لوحتي
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link
                  to="/login"
                  onClick={() =>
                    track("landing_cta_click", { metadata: { cta: "header_login" } })
                  }
                >
                  دخول
                </Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link
                  to="/signup"
                  onClick={() =>
                    track("landing_cta_click", { metadata: { cta: "header_signup" } })
                  }
                >
                  إنشاء حساب
                </Link>
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
            {navItems.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
            {!isAuthenticated && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/login" onClick={() => setOpen(false)}>
                    دخول
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup" onClick={() => setOpen(false)}>
                    إنشاء حساب
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-gradient-soft"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8 lg:py-24">
        {/* Right column — text */}
        <div className="text-center lg:text-right">
          <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            سوق B2B لقطاع الصحة
          </Badge>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            منصة B2B لقطاع الصحة تجمع بين{" "}
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              السوق وإدارة الأعمال
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
            اكتشف موردين موثوقين، اعرض منتجاتك، ونظّم الطلبات والفواتير والعملاء من مكان واحد.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link
                to="/signup"
                onClick={() =>
                  track("landing_cta_click", { metadata: { cta: "hero_signup" } })
                }
              >
                <Rocket className="h-5 w-5" />
                أنشئ حسابك مجانًا
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link
                to="/vendors"
                onClick={() =>
                  track("landing_cta_click", { metadata: { cta: "hero_browse" } })
                }
              >
                <ShoppingBag className="h-5 w-5" />
                تصفح السوق
              </Link>
            </Button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground sm:text-sm lg:justify-start">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              موردون موثوقون
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              تسجيل مجاني
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              متابعة واضحة للطلبات
            </span>
          </div>
        </div>

        {/* Left column — mockup */}
        <div className="relative hidden lg:block">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-primary opacity-20 blur-3xl" />
      <Card className="relative overflow-hidden p-5 shadow-elegant">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary">
              <Leaf className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">لوحة الشركة</span>
          </div>
          <Badge variant="secondary" className="text-[10px]">مباشر</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <MockKpi icon={ClipboardList} label="طلبات اليوم" value="24" tone="primary" />
          <MockKpi icon={FileText} label="فواتير" value="18" tone="success" />
          <MockKpi icon={Users} label="عملاء" value="312" tone="warning" />
        </div>

        <div className="mt-3 rounded-xl border border-border/60 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span>الطلبات الأخيرة</span>
            <span className="text-muted-foreground">اليوم</span>
          </div>
          <div className="space-y-2">
            {[
              { id: "#1042", name: "صيدلية الفجر", st: "قيد التحضير", tone: "warning" as const },
              { id: "#1041", name: "متجر الصحة", st: "تم الشحن", tone: "primary" as const },
              { id: "#1040", name: "تعاونية الأعشاب", st: "مكتمل", tone: "success" as const },
            ].map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg bg-secondary/40 px-2.5 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">{r.id}</span>
                  <span className="font-medium">{r.name}</span>
                </div>
                <Badge
                  className={
                    r.tone === "success"
                      ? "bg-success/15 text-success hover:bg-success/15"
                      : r.tone === "warning"
                      ? "bg-warning/15 text-warning-foreground hover:bg-warning/15"
                      : "bg-primary/15 text-primary hover:bg-primary/15"
                  }
                  variant="secondary"
                >
                  {r.st}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-border/60 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              منتجات نشطة
            </div>
            <div className="text-lg font-extrabold">1,248</div>
            <div className="mt-1 text-[10px] text-success">+12 هذا الأسبوع</div>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              مبيعات الشهر
            </div>
            <div className="text-lg font-extrabold">42,500 د.م</div>
            <div className="mt-1 text-[10px] text-success">+8.4%</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MockKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  tone: "primary" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
      ? "bg-warning/10 text-warning-foreground"
      : "bg-primary/10 text-primary";
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className={`mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-base font-extrabold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

/* ── Audience ───────────────────────────────────────────────────────── */

function AudienceSection() {
  const items = [
    {
      icon: Store,
      t: "للموردين",
      d: "اعرض منتجاتك، استقبل الطلبات، ووسّع وصولك إلى عملاء مهنيين.",
    },
    {
      icon: ShoppingBag,
      t: "للمشترين",
      d: "اعثر على موردين موثوقين، قارن المنتجات، واطلب بالجملة بسهولة.",
    },
    {
      icon: LayoutDashboard,
      t: "لإدارة الشركات",
      d: "تابع العمليات، الفواتير، والعملاء من لوحة واحدة تساعدك على التنظيم والنمو.",
    },
  ];
  return (
    <section className="border-t border-border/60 bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            حلول تناسب كل طرف في المنظومة الصحية
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            سواء كنت موردًا، مشتريًا، أو تدير شركة في قطاع الصحة، تمنحك Nexora الأدوات المناسبة للعمل بكفاءة أكبر.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map(({ icon: Icon, t, d }) => (
            <Card
              key={t}
              className="group p-6 transition-all hover:-translate-y-0.5 hover:shadow-elegant"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild size="lg" variant="outline">
            <Link
              to="/signup"
              onClick={() =>
                track("landing_cta_click", { metadata: { cta: "audience_start" } })
              }
            >
              ابدأ حسب دورك
              <ArrowLeftCircle className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Why Nexora ─────────────────────────────────────────────────────── */

function WhyNexora() {
  const items = [
    {
      icon: ShieldCheck,
      t: "موردون موثوقون",
      d: "وصول أسرع إلى شركاء مهنيين داخل قطاع الصحة.",
    },
    {
      icon: ClipboardList,
      t: "إدارة أوضح للطلبات",
      d: "تابع كل طلب من الإنشاء حتى الإتمام.",
    },
    {
      icon: FileText,
      t: "تنظيم الفواتير والعملاء",
      d: "كل ما تحتاجه لمتابعة العمليات التجارية في مكان واحد.",
    },
    {
      icon: HeartPulse,
      t: "تجربة احترافية للشركات",
      d: "واجهة تساعدك على إدارة الأعمال وتحسين الخدمة المقدمة للعملاء.",
    },
  ];
  return (
    <section
      id="why-nexora"
      className="border-t border-border/60 bg-secondary/30 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">أكثر من مجرد سوق جملة</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Nexora لا تربط فقط بين البائع والمشتري، بل تساعد الشركات أيضًا على تنظيم الطلبات والفواتير والعملاء وتحسين تجربة العمل اليومية.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, t, d }) => (
            <Card key={t} className="p-6 transition-all hover:shadow-soft">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold">{t}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{d}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How It Works ───────────────────────────────────────────────────── */

function HowItWorks() {
  const vendor = [
    { t: "أنشئ حساب شركتك", d: "أنشئ بوابة خاصة بشركتك خلال دقائق." },
    { t: "أضف منتجاتك", d: "ارفع المنتجات، الأسعار، والكميات المتاحة." },
    { t: "استقبل الطلبات", d: "تابع الطلبات وتواصل مع المشترين بسهولة." },
  ];
  const buyer = [
    { t: "اكتشف الموردين", d: "ابحث حسب الفئة أو نوع المنتجات." },
    { t: "اطلب بالجملة", d: "اختر الكميات المناسبة وابدأ الطلب بسرعة." },
    { t: "تابع طلباتك", d: "استلم طلباتك مع متابعة أوضح للحالة والتفاصيل." },
  ];

  return (
    <section
      id="how-it-works"
      className="border-t border-border/60 bg-background py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">كيف يعمل Nexora؟</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            خطوات بسيطة سواء كنت موردًا أو مشتريًا
          </p>
        </div>

        <Tabs defaultValue="vendor" className="w-full">
          <TabsList className="mx-auto grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="vendor">للموردين</TabsTrigger>
            <TabsTrigger value="buyer">للمشترين</TabsTrigger>
          </TabsList>
          <TabsContent value="vendor" className="mt-8">
            <StepsList steps={vendor} icon={Store} />
          </TabsContent>
          <TabsContent value="buyer" className="mt-8">
            <StepsList steps={buyer} icon={ShoppingBag} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function StepsList({
  steps,
  icon: Icon,
}: {
  steps: { t: string; d: string }[];
  icon: typeof Store;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {steps.map((s, i) => (
        <Card key={s.t} className="relative p-6">
          <div className="absolute left-4 top-4 text-5xl font-black text-primary/10 leading-none">
            {i + 1}
          </div>
          <div className="relative">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold">{s.t}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── Categories ─────────────────────────────────────────────────────── */

function CategoriesSection() {
  return (
    <section
      id="categories"
      className="border-t border-border/60 bg-secondary/30 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            فئات تغطي احتياجات قطاع الصحة
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            من الأدوية والمكملات إلى الأعشاب الطبية والمستلزمات، صُممت Nexora لتخدم مختلف الأنشطة المرتبطة بقطاع الصحة.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map(({ icon: Icon, label, desc }) => (
            <Card
              key={label}
              role="button"
              tabIndex={0}
              onClick={() =>
                track("landing_category_click", { metadata: { category: label } })
              }
              className="group flex cursor-pointer flex-col items-center gap-2 p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-elegant"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-gradient-primary group-hover:text-primary-foreground">
                <Icon className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-[11px] text-muted-foreground">{desc}</div>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="outline">
            <Link
              to="/vendors"
              onClick={() =>
                track("landing_cta_click", { metadata: { cta: "categories_view_all" } })
              }
            >
              عرض جميع الفئات
              <ArrowLeftCircle className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Trusted Suppliers ──────────────────────────────────────────────── */

function TrustedSuppliers({
  vendors,
  loading,
}: {
  vendors: VendorCard[];
  loading: boolean;
}) {
  return (
    <section
      id="suppliers"
      className="border-t border-border/60 bg-background py-14 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold sm:text-3xl">موردون يثق بهم السوق</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              تعاون مع موردين مهنيين داخل القطاع الصحي من خلال شبكة تنمو باستمرار.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link
              to="/vendors"
              onClick={() =>
                track("landing_cta_click", { metadata: { cta: "suppliers_view_all" } })
              }
            >
              عرض جميع الموردين
              <ArrowLeftCircle className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="h-36 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : vendors.length === 0 ? (
          <Card className="p-10 text-center">
            <Store className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              لم يتم إدراج أي مورد بعد. كن أول مورد على Nexora.
            </p>
            <Button asChild className="mt-4">
              <Link to="/signup">
                <Rocket className="h-4 w-4" />
                أنشئ بوابتك
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vendors.map((v) => (
              <Link
                key={v.id}
                to="/store/$slug"
                params={{ slug: v.slug }}
                onClick={() =>
                  track("landing_vendor_click", {
                    vendor_id: v.id,
                    metadata: { slug: v.slug, name: v.display_name },
                  })
                }
                className="group"
              >
                <Card className="flex h-full flex-col items-center gap-3 p-5 text-center transition-all hover:-translate-y-0.5 hover:shadow-elegant">
                  <div
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl"
                    style={{ backgroundColor: v.brand_color || "var(--accent)" }}
                  >
                    {v.logo_url ? (
                      <img
                        src={v.logo_url}
                        alt={v.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 className="h-7 w-7 text-primary-foreground" />
                    )}
                  </div>
                  <div className="line-clamp-2 text-sm font-semibold leading-tight">
                    {v.display_name}
                  </div>
                  <Badge
                    variant="secondary"
                    className="gap-1 text-[10px] bg-success/10 text-success hover:bg-success/10"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    موثّق
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Featured Products ──────────────────────────────────────────────── */

function FeaturedProducts({
  products,
  loading,
}: {
  products: ProductCard[];
  loading: boolean;
}) {
  return (
    <section className="border-t border-border/60 bg-secondary/30 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold sm:text-3xl">منتجات مميزة داخل Nexora</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              استعرض أحدث المنتجات المتاحة من موردين مختارين داخل قطاع الصحة.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link
              to="/vendors"
              onClick={() =>
                track("landing_cta_click", { metadata: { cta: "products_view_all" } })
              }
            >
              تصفح جميع المنتجات
              <ArrowLeftCircle className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-72 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card className="p-10 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              لم يتم رفع أي منتجات بعد.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {products.map((p) => {
              const inStock = (p.stock_quantity ?? 0) > 0;
              return (
                <Card
                  key={p.id}
                  className="group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-elegant"
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package className="h-10 w-10" />
                      </div>
                    )}
                    <Badge
                      variant="secondary"
                      className={`absolute right-2 top-2 gap-1 text-[10px] ${
                        inStock
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <PackageCheck className="h-3 w-3" />
                      {inStock ? "متوفر" : "غير متوفر"}
                    </Badge>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 text-sm font-bold">{p.name}</h3>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                      {p.company?.display_name || p.company?.name || "—"}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-extrabold text-primary">
                        {p.price != null ? `${p.price} د.م` : "—"}
                      </span>
                      <span className="text-muted-foreground">
                        MOQ: {p.min_order_quantity ?? 1}
                      </span>
                    </div>
                    {p.company?.slug ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                      >
                        <Link
                          to="/store/$slug/product/$id"
                          params={{ slug: p.company.slug, id: p.id }}
                          onClick={() =>
                            track("landing_product_click", {
                              metadata: { product_id: p.id },
                            })
                          }
                        >
                          عرض التفاصيل
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Stats ──────────────────────────────────────────────────────────── */

function StatsSection({
  stats,
}: {
  stats: { products: number; vendors: number; orders: number };
}) {
  const items = [
    {
      icon: Package,
      value: stats.products > 0 ? `+${stats.products}` : "+1,200",
      label: "منتج معروض",
    },
    {
      icon: Building2,
      value: stats.vendors > 0 ? `+${stats.vendors}` : "+180",
      label: "مورد نشط",
    },
    {
      icon: ClipboardList,
      value: stats.orders > 0 ? `+${stats.orders}` : "+2,500",
      label: "طلب مكتمل",
    },
    { icon: Search, value: "6", label: "قطاعات رئيسية" },
  ];

  return (
    <section className="border-t border-border/60 bg-gradient-primary py-14 text-primary-foreground sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Nexora بالأرقام</h2>
          <p className="mt-2 text-sm opacity-90">شبكة تنمو يومًا بعد يوم</p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map(({ icon: Icon, value, label }) => (
            <Card
              key={label}
              className="border-primary-foreground/15 bg-primary-foreground/10 p-5 text-center text-primary-foreground backdrop-blur"
            >
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/20">
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-extrabold sm:text-3xl">{value}</div>
              <div className="mt-1 text-xs opacity-90 sm:text-sm">{label}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="border-t border-border/60 bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Card className="overflow-hidden bg-gradient-primary p-10 text-center text-primary-foreground shadow-elegant sm:p-14">
          <h2 className="text-3xl font-extrabold sm:text-4xl">
            جاهز لتنمية أعمالك في قطاع الصحة؟
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">
            انضم إلى Nexora وابدأ في الوصول إلى موردين موثوقين، تنظيم الطلبات، وتحسين تجربة عملائك من منصة واحدة.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link
                to="/signup"
                onClick={() =>
                  track("landing_cta_click", { metadata: { cta: "final_signup" } })
                }
              >
                <Rocket className="h-5 w-5" />
                أنشئ حسابك مجانًا
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
            >
              <Link
                to="/vendors"
                onClick={() =>
                  track("landing_cta_click", { metadata: { cta: "final_browse" } })
                }
              >
                <ShoppingBag className="h-5 w-5" />
                تصفح السوق
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────────────────────── */

function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Leaf className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-extrabold">Nexora</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Nexora منصة B2B لقطاع الصحة.
          </p>
        </div>
        <FooterCol
          title="استكشف"
          links={[
            { label: "الرئيسية", href: "#hero" },
            { label: "كيف يعمل", href: "#how-it-works" },
            { label: "الموردون", href: "#suppliers" },
            { label: "الفئات", href: "#categories" },
          ]}
        />
        <FooterCol
          title="حسابك"
          internal={[
            { label: "للموردين", to: "/signup" },
            { label: "للمشترين", to: "/signup" },
            { label: "تسجيل الدخول", to: "/login" },
            { label: "الدعم", to: "/login" },
          ]}
        />
        <FooterCol
          title="الشركة"
          links={[
            { label: "من نحن", href: "#why-nexora" },
            { label: "اتصل بنا", href: "mailto:hello@nexora.app" },
            { label: "الشروط والأحكام", href: "#" },
            { label: "سياسة الخصوصية", href: "#" },
          ]}
        />
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Nexora — جميع الحقوق محفوظة</span>
          <span>سوق B2B لقطاع الصحة</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
  internal,
}: {
  title: string;
  links?: { label: string; href: string }[];
  internal?: { label: string; to: string }[];
}) {
  return (
    <div>
      <div className="text-sm font-bold">{title}</div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {links?.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          </li>
        ))}
        {internal?.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
