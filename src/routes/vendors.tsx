import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, Search, ArrowLeft, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { homeForRole } from "@/lib/roleRouting";

export const Route = createFileRoute("/vendors")({
  component: VendorDirectory,
  head: () => {
    const url = "https://herbal-connect-maroc.lovable.app/vendors";
    const title = "دليل البائعين — Nexora";
    const description =
      "تصفّح قائمة البائعين المعتمدين على منصة Nexora — صيدليات، مكملات غذائية، معدات صحية ورياضية.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            url,
          }),
        },
      ],
    };
  },
});

interface Vendor {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  brand_color: string;
}

function VendorDirectory() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const { session, marketplaceRole } = useAuth();
  const dashboardHref = homeForRole(marketplaceRole);
  const showDashboard = !!session && dashboardHref !== "/login";

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, slug, display_name, logo_url, brand_color")
        .order("display_name", { ascending: true });
      if (!alive) return;
      if (!error && data) setVendors(data as Vendor[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = vendors.filter((v) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      v.display_name.toLowerCase().includes(needle) ||
      v.name.toLowerCase().includes(needle) ||
      v.slug.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-soft" dir="rtl">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span>الرئيسية</span>
          </Link>
          <h1 className="text-base font-bold sm:text-lg">دليل البائعين</h1>
          {showDashboard ? (
            <Button asChild variant="outline" size="sm">
              <Link to={dashboardHref} className="flex items-center gap-1.5">
                <LayoutDashboard className="h-4 w-4" />
                <span>لوحتي</span>
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/login">تسجيل الدخول</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            اختر بائعاً للدخول إلى متجره وتصفّح منتجاته.
          </p>
          <div className="relative mt-4">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم البائع..."
              className="pr-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Building2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold">لا يوجد بائعون بعد</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {q
                ? "لم نجد نتائج مطابقة لبحثك."
                : "ستظهر هنا قائمة البائعين المعتمدين فور انضمامهم إلى المنصة."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((v) => (
              <Link
                key={v.id}
                to="/store/$slug"
                params={{ slug: v.slug }}
                className="group"
              >
                <Card className="flex aspect-square flex-col items-center justify-center gap-3 p-4 transition-all hover:shadow-elegant hover:-translate-y-0.5">
                  <div
                    className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-white shadow-glow"
                    style={{ backgroundColor: v.brand_color }}
                  >
                    {v.logo_url ? (
                      <img src={v.logo_url} alt={v.display_name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold">
                        {(v.display_name || v.name || "?")[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-center text-xs font-semibold sm:text-sm">
                    {v.display_name || v.name}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
