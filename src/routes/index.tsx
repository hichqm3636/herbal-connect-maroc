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
  Lock,
  Globe,
  TrendingUp,
  ArrowLeftCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { homeForRole } from "@/lib/roleRouting";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexora — سوق B2B للجملة في قطاع الصحة" },
      {
        name: "description",
        content:
          "منصة Nexora تجمع موردي قطاع الصحة (أعشاب، مكملات، مستلزمات طبية، أدوية) ومشتري الجملة في سوق إلكتروني منظّم، مع تكامل توصيل عبر API.",
      },
      { property: "og:title", content: "Nexora — سوق B2B للجملة في قطاع الصحة" },
      {
        property: "og:description",
        content:
          "اعرض منتجاتك بالجملة أو اشترِ من موردين موثوقين في قطاع الصحة. سوق إلكتروني منظّم + اشتراك SaaS + تكامل توصيل.",
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
            "منصة SaaS وسوق إلكتروني B2B لقطاع الصحة تربط الموردين بمشتري الجملة.",
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

const CATEGORIES = [
  { icon: Leaf, label: "أعشاب طبية", desc: "أعشاب وزيوت طبيعية" },
  { icon: FlaskConical, label: "مكمّلات غذائية", desc: "فيتامينات ومعادن" },
  { icon: Stethoscope, label: "مستلزمات طبية", desc: "أجهزة وأدوات" },
  { icon: Pill, label: "أدوية", desc: "موردون مرخّصون فقط", restricted: true },
  { icon: Sparkles, label: "تجميل طبي", desc: "عناية ومستحضرات" },
  { icon: Package, label: "تغليف ومواد خام", desc: "للمصنّعين" },
];

function NexoraLanding({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [vendors, setVendors] = useState<VendorCard[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("companies")
      .select("id, name, display_name, logo_url, brand_color, slug")
      .eq("is_listed", true)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return;
        setVendors((data ?? []) as VendorCard[]);
        setVendorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <LandingHeader isAuthenticated={isAuthenticated} />
      <Hero />
      <Categories />
      <FeaturedVendors vendors={vendors} loading={vendorsLoading} />
      <HowItWorks />
      <WhyNexora />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */

function LandingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Leaf className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">Nexora</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          <Link to="/vendors" className="transition-colors hover:text-foreground">
            السوق
          </Link>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            كيف يعمل
          </a>
          <a href="#why-nexora" className="transition-colors hover:text-foreground">
            لماذا Nexora
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link to="/client">لوحتي</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link to="/login">تسجيل الدخول</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">ابدأ مجانًا</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-soft">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            سوق B2B لقطاع الصحة
          </Badge>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            سوق <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">الجملة المنظّم</span>
            <br />
            لقطاع الصحة في مكان واحد
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Nexora تربط شركات الأعشاب والمكمّلات والمستلزمات الطبية والأدوية
            بمشتري الجملة، عبر سوق إلكتروني واحد + بوابة خاصة لكل شركة + تكامل
            توصيل عبر API.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/signup">
                <Store className="h-5 w-5" />
                اعرض منتجاتك (مورد)
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link to="/vendors">
                <ShoppingBag className="h-5 w-5" />
                تصفّح السوق (مشترٍ)
              </Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              تسجيل مجاني للتصفّح
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-success" />
              المنصة لا تحتفظ بالأموال
            </span>
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-success" />
              تكامل توصيل API
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Categories ─────────────────────────────────────────────────────── */

function Categories() {
  return (
    <section className="border-t border-border/60 bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">فئات قطاع الصحة</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            6 فئات رئيسية، مع حماية خاصة للموردين المرخّصين
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map(({ icon: Icon, label, desc, restricted }) => (
            <Card
              key={label}
              className="group flex flex-col items-center gap-2 p-4 text-center transition-all hover:shadow-elegant hover:-translate-y-0.5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-gradient-primary group-hover:text-primary-foreground">
                <Icon className="h-6 w-6" />
              </div>
              <div className="text-sm font-semibold">{label}</div>
              <div className="text-[11px] text-muted-foreground">{desc}</div>
              {restricted && (
                <Badge variant="outline" className="mt-1 gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" />
                  مقيّد
                </Badge>
              )}
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Featured vendors ───────────────────────────────────────────────── */

function FeaturedVendors({
  vendors,
  loading,
}: {
  vendors: VendorCard[];
  loading: boolean;
}) {
  return (
    <section className="border-t border-border/60 bg-secondary/30 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">موردون على المنصة</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              شركات نشطة في سوق Nexora
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/vendors">
              عرض الكل
              <ArrowLeftCircle className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="h-32 animate-pulse bg-muted/40" />
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
                className="group"
              >
                <Card className="flex h-full flex-col items-center gap-3 p-5 text-center transition-all hover:shadow-elegant hover:-translate-y-0.5">
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
                  <div className="text-sm font-semibold leading-tight line-clamp-2">
                    {v.display_name}
                  </div>
                  <span className="mt-auto text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    زيارة المتجر ←
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── How it works ───────────────────────────────────────────────────── */

function HowItWorks() {
  const vendorSteps = [
    { n: 1, t: "اشترك في خطة مناسبة", d: "أنشئ بوابتك على نطاق فرعي خاص بشركتك في أقل من دقيقة." },
    { n: 2, t: "أضف منتجاتك بالجملة", d: "كتالوج، أسعار طبقات الكميات، ومخزون مباشر." },
    { n: 3, t: "استقبل الطلبات", d: "تواصل مباشر مع المشتري، توصيل عبر شركاء API، الدفع بينكما." },
  ];
  const buyerSteps = [
    { n: 1, t: "تصفّح السوق مجانًا", d: "اكتشف الموردين والمنتجات بدون تسجيل." },
    { n: 2, t: "أنشئ حساب شركة", d: "للوصول إلى الأسعار والطلبات." },
    { n: 3, t: "اطلب وادفع للمورد", d: "Nexora لا تتدخل في المال — تعامل مباشر مع المورد." },
  ];

  return (
    <section id="how-it-works" className="border-t border-border/60 bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">كيف يعمل Nexora</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ثلاث خطوات للموردين، وثلاث للمشترين
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <Store className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold">للموردين</h3>
            </div>
            <ol className="space-y-5">
              {vendorSteps.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                    {s.n}
                  </div>
                  <div>
                    <div className="font-semibold">{s.t}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{s.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold">للمشترين بالجملة</h3>
            </div>
            <ol className="space-y-5">
              {buyerSteps.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                    {s.n}
                  </div>
                  <div>
                    <div className="font-semibold">{s.t}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{s.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ── Why Nexora ─────────────────────────────────────────────────────── */

function WhyNexora() {
  const items = [
    {
      icon: Globe,
      t: "سوق منظّم",
      d: "كل الموردين في مكان واحد، مع تصنيف واضح لقطاع الصحة.",
    },
    {
      icon: ShieldCheck,
      t: "خصوصية الموردين الحساسين",
      d: "شركات الأدوية وغيرها يمكنها إخفاء الأسعار حتى تحقّق المشتري.",
    },
    {
      icon: Lock,
      t: "أنت تتحكم بأموالك",
      d: "Nexora لا تأخذ عمولة على المعاملات ولا تحتفظ بالأموال — التعامل مباشر.",
    },
    {
      icon: Truck,
      t: "توصيل جاهز عبر API",
      d: "تكامل مع شركات شحن — لا داعي لبناء لوجستيات من الصفر.",
    },
    {
      icon: TrendingUp,
      t: "بوابة احترافية لكل شركة",
      d: "نطاق فرعي خاص (مثل company.nexora.app)، علامتك التجارية، تحليلات.",
    },
    {
      icon: Sparkles,
      t: "تركيز على B2B",
      d: "أسعار طبقات الكمية، حد أدنى للطلب، حسابات شركات — لا تجزئة.",
    },
  ];

  return (
    <section id="why-nexora" className="border-t border-border/60 bg-secondary/30 py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">لماذا Nexora</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            صُمّمت من البداية لقطاع الصحة B2B
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

/* ── Final CTA ──────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="border-t border-border/60 bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Card className="overflow-hidden bg-gradient-primary p-10 text-center text-primary-foreground shadow-elegant sm:p-14">
          <h2 className="text-3xl font-extrabold sm:text-4xl">
            جاهز لتنضمّ إلى Nexora؟
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">
            ابدأ مجانًا — أنشئ بوابتك في أقل من 30 ثانية، أو تصفّح السوق كمشترٍ
            بدون أي التزام.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to="/signup">
                <Rocket className="h-5 w-5" />
                أنشئ بوابتك الآن
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
            >
              <Link to="/vendors">تصفّح السوق</Link>
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
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <Leaf className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-base font-extrabold">Nexora</span>
          </div>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            منصة SaaS وسوق B2B لقطاع الصحة. تربط الموردين بمشتري الجملة، مع
            بوابات مخصّصة وتكامل توصيل عبر API.
          </p>
        </div>
        <div>
          <div className="text-sm font-bold">المنتج</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/vendors" className="hover:text-foreground">السوق</Link></li>
            <li><a href="#how-it-works" className="hover:text-foreground">كيف يعمل</a></li>
            <li><a href="#why-nexora" className="hover:text-foreground">المزايا</a></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold">حسابك</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/signup" className="hover:text-foreground">إنشاء حساب</Link></li>
            <li><Link to="/login" className="hover:text-foreground">تسجيل الدخول</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Nexora — سوق B2B لقطاع الصحة</span>
          <span>Made for healthcare wholesale</span>
        </div>
      </div>
    </footer>
  );
}
