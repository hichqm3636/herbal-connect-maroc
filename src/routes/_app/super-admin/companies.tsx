import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Search,
  Eye,
  EyeOff,
  Users,
  ShoppingCart,
  Wallet,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/super-admin/companies")({
  component: CompaniesPage,
  head: () => ({ meta: [{ title: "الشركات — Nexora" }] }),
});

interface Company {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  brand_color: string;
  logo_url: string | null;
  is_listed: boolean;
  contact_phone: string | null;
  created_at: string;
}

interface CompanyDetail {
  users: number;
  products: number;
  orders: number;
  gmv: number;
  pending: number;
  awaiting: number;
  plan: string | null;
  subStatus: string | null;
}

function CompaniesPage() {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "listed" | "unlisted">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, display_name, slug, brand_color, logo_url, is_listed, contact_phone, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("تعذّر تحميل الشركات");
      return;
    }
    setRows((data as Company[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (tab === "listed" && !r.is_listed) return false;
        if (tab === "unlisted" && r.is_listed) return false;
        if (!term) return true;
        return (
          r.name.toLowerCase().includes(term) ||
          (r.display_name ?? "").toLowerCase().includes(term) ||
          r.slug.toLowerCase().includes(term)
        );
      });
  }, [rows, q, tab]);

  const counts = useMemo(() => {
    const all = rows?.length ?? 0;
    const listed = rows?.filter((r) => r.is_listed).length ?? 0;
    return { all, listed, unlisted: all - listed };
  }, [rows]);

  const toggleListed = async (c: Company) => {
    setBusyId(c.id);
    const { error } = await supabase
      .from("companies")
      .update({ is_listed: !c.is_listed })
      .eq("id", c.id);
    setBusyId(null);
    if (error) {
      toast.error("تعذّر تحديث حالة النشر");
      return;
    }
    toast.success(!c.is_listed ? "تم نشر الشركة" : "تم إخفاء الشركة من marketplace");
    setRows((prev) => prev?.map((r) => (r.id === c.id ? { ...r, is_listed: !c.is_listed } : r)) ?? null);
    if (selected?.id === c.id) setSelected({ ...c, is_listed: !c.is_listed });
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">الشركات</h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة كل الشركات على المنصة: عرض، نشر، أو إخفاء.
        </p>
      </div>

      {/* Toolbar */}
      <Card className="p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو النطاق…"
              className="pr-9"
            />
          </div>
          <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {([
              ["all", `الكل (${counts.all})`],
              ["listed", `منشورة (${counts.listed})`],
              ["unlisted", `مخفية (${counts.unlisted})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "px-3 h-8 text-xs rounded-md transition-colors",
                  tab === key
                    ? "bg-background shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Grid */}
      {rows === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          لا توجد نتائج تطابق البحث.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card
              key={c.id}
              className="p-4 shadow-soft hover:shadow-elegant transition-shadow flex flex-col"
            >
              <button
                type="button"
                onClick={() => setSelected(c)}
                className="flex items-start gap-3 text-right"
              >
                <div
                  className="h-12 w-12 rounded-lg shrink-0 flex items-center justify-center text-white font-bold overflow-hidden"
                  style={{ backgroundColor: c.brand_color }}
                >
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (c.display_name || c.name)[0]
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold truncate">{c.display_name || c.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">/{c.slug}</p>
                  <div className="mt-1.5">
                    {c.is_listed ? (
                      <Badge variant="outline" className="text-[10px] h-5 border-success/40 text-success">
                        منشورة
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-5 border-muted-foreground/30 text-muted-foreground">
                        مخفية
                      </Badge>
                    )}
                  </div>
                </div>
              </button>

              <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
                <a
                  href={`/store/${c.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  زيارة المتجر
                  <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  size="sm"
                  variant={c.is_listed ? "outline" : "default"}
                  className="h-7 text-xs"
                  disabled={busyId === c.id}
                  onClick={() => toggleListed(c)}
                >
                  {busyId === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : c.is_listed ? (
                    <>
                      <EyeOff className="h-3 w-3 ml-1" />
                      إخفاء
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3 ml-1" />
                      نشر
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CompanyDetailSheet
        company={selected}
        onClose={() => setSelected(null)}
        onToggle={toggleListed}
        busy={busyId}
      />
    </div>
  );
}

function CompanyDetailSheet({
  company,
  onClose,
  onToggle,
  busy,
}: {
  company: Company | null;
  onClose: () => void;
  onToggle: (c: Company) => void;
  busy: string | null;
}) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!company) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [users, products, orders, gmv, pending, awaiting, sub] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        supabase.from("orders").select("total_mad").eq("company_id", company.id),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("payment_status", "awaiting_confirmation"),
        supabase
          .from("company_subscriptions")
          .select("status, plan_id, subscription_plans(name)")
          .eq("company_id", company.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const sumGmv = (gmv.data ?? []).reduce((a, r) => a + Number(r.total_mad ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const planName = (sub.data as any)?.subscription_plans?.name ?? null;
      setDetail({
        users: users.count ?? 0,
        products: products.count ?? 0,
        orders: orders.count ?? 0,
        gmv: sumGmv,
        pending: pending.count ?? 0,
        awaiting: awaiting.count ?? 0,
        plan: planName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subStatus: ((sub.data as any)?.status as string) ?? null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [company]);

  return (
    <Sheet open={!!company} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
        {company && (
          <>
            <SheetHeader className="text-right">
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-lg shrink-0 flex items-center justify-center text-white font-bold overflow-hidden"
                  style={{ backgroundColor: company.brand_color }}
                >
                  {company.logo_url ? (
                    <img src={company.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (company.display_name || company.name)[0]
                  )}
                </div>
                <div className="min-w-0 text-right">
                  <SheetTitle className="text-right">
                    {company.display_name || company.name}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">/{company.slug}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-5 space-y-4">
              {/* Status row */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">الحالة في marketplace</p>
                  <p className="text-sm font-bold mt-0.5">
                    {company.is_listed ? "منشورة" : "مخفية"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={company.is_listed ? "outline" : "default"}
                  disabled={busy === company.id}
                  onClick={() => onToggle(company)}
                >
                  {busy === company.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : company.is_listed ? (
                    "إخفاء"
                  ) : (
                    "نشر"
                  )}
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <DetailStat icon={Users} label="مستخدمون" value={loading ? "—" : String(detail?.users ?? 0)} />
                <DetailStat icon={ShoppingCart} label="طلبات" value={loading ? "—" : String(detail?.orders ?? 0)} />
                <DetailStat
                  icon={Wallet}
                  label="إجمالي المبيعات"
                  value={loading ? "—" : formatMAD(detail?.gmv ?? 0)}
                />
                <DetailStat
                  icon={Building2}
                  label="منتجات"
                  value={loading ? "—" : String(detail?.products ?? 0)}
                />
              </div>

              {/* Alerts inside company */}
              {(detail?.pending ?? 0) > 0 || (detail?.awaiting ?? 0) > 0 ? (
                <div className="rounded-lg border border-warning/40 bg-warning/[0.05] p-3 space-y-1.5">
                  <p className="text-xs font-bold">تنبيهات داخل الشركة</p>
                  {(detail?.pending ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      • {detail!.pending} طلب قيد الانتظار
                    </p>
                  )}
                  {(detail?.awaiting ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      • {detail!.awaiting} دفعة بانتظار التأكيد
                    </p>
                  )}
                </div>
              ) : null}

              {/* Subscription */}
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">الاشتراك</p>
                <p className="text-sm font-bold mt-0.5">
                  {detail?.plan ?? "—"}{" "}
                  {detail?.subStatus && (
                    <Badge variant="outline" className="text-[10px] h-5 mr-1">
                      {detail.subStatus}
                    </Badge>
                  )}
                </p>
              </div>

              {/* Meta */}
              <div className="text-[11px] text-muted-foreground">
                أُنشئت في {new Date(company.created_at).toLocaleDateString("ar-MA")}
                {company.contact_phone && <> • {company.contact_phone}</>}
              </div>

              <div className="pt-2">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href={`/store/${company.slug}`} target="_blank" rel="noreferrer">
                    زيارة المتجر
                    <ExternalLink className="h-3 w-3 mr-2" />
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 text-sm font-bold truncate">{value}</p>
    </div>
  );
}
