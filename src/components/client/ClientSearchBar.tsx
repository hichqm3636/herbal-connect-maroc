import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Store, Package, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { formatMAD } from "@/lib/format";
import { trackClient } from "@/lib/clientAnalytics";

interface VendorHit {
  kind: "vendor";
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}
interface ProductHit {
  kind: "product";
  id: string;
  name_ar: string;
  price_mad: number;
  image_url: string | null;
  vendor_slug: string;
}
type Hit = VendorHit | ProductHit;

/**
 * Smart search bar shown at the top of the client dashboard.
 * Debounced fuzzy search across active products + listed vendors.
 */
export function ClientSearchBar() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const [{ data: vendors }, { data: products }] = await Promise.all([
        supabase
          .from("companies")
          .select("id, slug, name, display_name, logo_url")
          .eq("is_listed", true)
          .or(`display_name.ilike.%${term}%,name.ilike.%${term}%`)
          .limit(4),
        supabase
          .from("products")
          .select(
            "id, name_ar, price_mad, image_url, company_id, companies:company_id(slug)",
          )
          .eq("active", true)
          .ilike("name_ar", `%${term}%`)
          .limit(6),
      ]);

      const vHits: VendorHit[] = (vendors ?? []).map((v: any) => ({
        kind: "vendor",
        id: v.id,
        slug: v.slug,
        name: v.display_name || v.name,
        logo_url: v.logo_url,
      }));
      const pHits: ProductHit[] = (products ?? [])
        .filter((p: any) => p.companies?.slug)
        .map((p: any) => ({
          kind: "product",
          id: p.id,
          name_ar: p.name_ar,
          price_mad: Number(p.price_mad),
          image_url: p.image_url,
          vendor_slug: p.companies.slug,
        }));
      setHits([...vHits, ...pHits]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const showDropdown = open && q.trim().length >= 2;
  const isEmpty = useMemo(
    () => !loading && hits.length === 0 && q.trim().length >= 2,
    [loading, hits, q],
  );

  return (
    <div ref={wrapRef} className="relative" dir="rtl">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="ابحث عن منتج أو بائع…"
          className="h-12 rounded-2xl bg-card pe-10 ps-10 text-sm shadow-soft"
          aria-label="بحث"
        />
        {q && (
          <button
            type="button"
            aria-label="مسح"
            onClick={() => {
              setQ("");
              setHits([]);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border bg-popover p-1 shadow-elegant">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري البحث…
            </div>
          )}
          {isEmpty && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              لا توجد نتائج
            </p>
          )}
          {!loading && hits.length > 0 && (
            <ul className="space-y-0.5">
              {hits.map((h) =>
                h.kind === "vendor" ? (
                  <li key={`v-${h.id}`}>
                    <Link
                      to="/store/$slug"
                      params={{ slug: h.slug }}
                      onClick={() => {
                        trackClient("vendor_store_view", { vendor_id: h.id, source: "search" });
                        setOpen(false);
                      }}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-accent"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {h.logo_url ? (
                          <img src={h.logo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Store className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h.name}</p>
                        <p className="text-[10px] text-muted-foreground">بائع</p>
                      </div>
                    </Link>
                  </li>
                ) : (
                  <li key={`p-${h.id}`}>
                    <Link
                      to="/store/$slug/product/$id"
                      params={{ slug: h.vendor_slug, id: h.id }}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-accent"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {h.image_url ? (
                          <img src={h.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h.name_ar}</p>
                        <p className="text-[11px] font-bold text-primary">
                          {formatMAD(h.price_mad)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
