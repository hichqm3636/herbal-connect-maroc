import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ArrowLeft, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/clientAnalytics";

interface Vendor {
  id: string;
  name: string;
  slug: string;
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
}

const DEMO_VENDORS = [
  {
    id: "demo-1",
    display_name: "صيدلية النموذج",
    tagline: "أدوية ومستلزمات طبية",
    brand_color: "#10b981",
  },
  {
    id: "demo-2",
    display_name: "متجر المكملات",
    tagline: "بروتين وفيتامينات رياضية",
    brand_color: "#6366f1",
  },
  {
    id: "demo-3",
    display_name: "العطار الطبيعي",
    tagline: "أعشاب ومنتجات عضوية",
    brand_color: "#f59e0b",
  },
] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "??";
}

export function SampleVendors() {
  const { data, isLoading } = useQuery({
    queryKey: ["client-sample-vendors"],
    queryFn: async (): Promise<Vendor[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, slug, display_name, logo_url, brand_color")
        .order("display_name", { ascending: true })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
    staleTime: 60_000,
  });

  return (
    <section
      className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8"
      dir="rtl"
      aria-labelledby="sample-vendors-title"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2
            id="sample-vendors-title"
            className="text-lg font-extrabold sm:text-xl"
          >
            موردون مقترحون
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            ابدأ بالتصفّح من هنا
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link
            to="/vendors"
            onClick={() =>
              trackClient("quick_action_click", { action: "sample_vendors_all" })
            }
          >
            عرض الكل
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.map((v) => {
            const name = v.display_name || v.name;
            return (
              <Link
                key={v.id}
                to="/store/$slug"
                params={{ slug: v.slug }}
                onClick={() =>
                  trackClient("quick_action_click", {
                    action: "sample_vendor_open",
                    vendor_id: v.id,
                  })
                }
                className="group flex flex-col items-center gap-2 rounded-2xl border bg-background p-4 text-center transition-colors hover:border-primary hover:bg-accent/40"
              >
                {v.logo_url ? (
                  <img
                    src={v.logo_url}
                    alt={name}
                    className="h-12 w-12 rounded-xl object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white"
                    style={{ backgroundColor: v.brand_color || "#10b981" }}
                  >
                    {initialsOf(name)}
                  </div>
                )}
                <p className="line-clamp-2 text-sm font-semibold">{name}</p>
              </Link>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            عيّنة توضيحية — سيظهر الموردون الفعليون هنا فور انضمامهم.
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {DEMO_VENDORS.map((v) => (
              <div
                key={v.id}
                className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-background/60 p-4 text-center opacity-90"
                aria-label="مورد تجريبي"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: v.brand_color }}
                >
                  <Building2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold">{v.display_name}</p>
                <p className="text-xs text-muted-foreground">{v.tagline}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
