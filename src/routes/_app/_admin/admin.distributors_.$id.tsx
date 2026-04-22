import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  Building2,
  Calendar,
  ChartBar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldOff,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DistributorCredentialsDialog } from "@/components/admin/DistributorCredentialsDialog";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  formatMAD,
  formatDateAr,
  LEVEL_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  STATUS_CLASSES,
} from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/distributors_/$id")({
  component: DistributorProfile,
  head: () => ({ meta: [{ title: "ملف الموزع — لوحة الإدارة" }] }),
});

interface ProfileRow {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  territory_id: string | null;
  level: string;
  loyalty_points: number;
  monthly_sales: number;
  is_active: boolean;
  account_type: string;
  company_id: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  created_at: string;
  itemCount: number;
}

interface TopProduct {
  product_id: string;
  name_ar: string;
  qty: number;
  revenue: number;
}

interface TerritoryLite {
  id: string;
  name: string;
}

interface PricingTierLite {
  id: string;
  name: string;
  base_discount_percent: number;
}

function DistributorProfile() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isSuperAdmin, companyId: viewerCompanyId } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [allTerritories, setAllTerritories] = useState<TerritoryLite[]>([]);
  const [assignedTerritories, setAssignedTerritories] = useState<TerritoryLite[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [tier, setTier] = useState<PricingTierLite | null>(null);
  const [customDiscount, setCustomDiscount] = useState<number | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingTerritory, setAddingTerritory] = useState(false);
  const [territoryToAdd, setTerritoryToAdd] = useState<string>("");
  const [waPromptOpen, setWaPromptOpen] = useState(false);
  const [waPassword, setWaPassword] = useState("");
  const [waCredsOpen, setWaCredsOpen] = useState(false);

  const load = async () => {
    setLoading(true);

    // 1. Profile
    const { data: pData, error: pErr } = await supabase
      .from("profiles")
      .select(
        "id, full_name, phone, city, territory_id, level, loyalty_points, monthly_sales, is_active, account_type, company_id, created_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (pErr || !pData) {
      setLoading(false);
      setProfile(null);
      return;
    }
    const p = pData as ProfileRow;
    setProfile(p);

    const cid = p.company_id;
    if (!cid) {
      setLoading(false);
      return;
    }

    // 2. Parallel: company, territories, assigned territories, orders, pricing
    const [
      { data: companyRow },
      { data: terrs },
      { data: assigned },
      { data: orderRows },
      { data: pricing },
    ] = await Promise.all([
      supabase.from("companies").select("display_name, name").eq("id", cid).maybeSingle(),
      supabase.from("territories").select("id, name").eq("company_id", cid).order("name"),
      supabase
        .from("distributor_territories")
        .select("territory_id, territories(id, name)")
        .eq("distributor_id", id)
        .eq("company_id", cid),
      supabase
        .from("orders")
        .select("id, order_number, status, total_mad, created_at")
        .eq("distributor_id", id)
        .eq("company_id", cid)
        .order("created_at", { ascending: false }),
      supabase
        .from("company_distributor_pricing")
        .select(
          "pricing_tier_id, custom_discount_percent, pricing_tiers(id, name, base_discount_percent)",
        )
        .eq("distributor_id", id)
        .eq("company_id", cid)
        .maybeSingle(),
    ]);

    setCompanyName(
      (companyRow as { display_name?: string; name?: string } | null)?.display_name ??
        (companyRow as { name?: string } | null)?.name ??
        null,
    );
    setAllTerritories((terrs ?? []) as TerritoryLite[]);

    type AssignedRow = { territories: { id: string; name: string } | null };
    const assignedList = ((assigned ?? []) as unknown as AssignedRow[])
      .map((r) => r.territories)
      .filter((t): t is { id: string; name: string } => !!t);
    // Ensure primary territory_id is shown even if missing from join table.
    if (p.territory_id) {
      const primary = (terrs ?? []).find(
        (t) => (t as TerritoryLite).id === p.territory_id,
      ) as TerritoryLite | undefined;
      if (primary && !assignedList.some((a) => a.id === primary.id)) {
        assignedList.unshift(primary);
      }
    }
    setAssignedTerritories(assignedList);

    // 3. Orders + counts. Fetch item counts per order with one query.
    const ordersList = (orderRows ?? []) as Omit<OrderRow, "itemCount">[];
    const orderIds = ordersList.map((o) => o.id);
    const itemCountMap = new Map<string, number>();
    const productAgg = new Map<string, { qty: number; revenue: number }>();
    const productIdSet = new Set<string>();

    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_id, quantity, unit_price_mad")
        .in("order_id", orderIds);
      for (const it of items ?? []) {
        itemCountMap.set(it.order_id, (itemCountMap.get(it.order_id) ?? 0) + 1);
        productIdSet.add(it.product_id);
        const cur = productAgg.get(it.product_id) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(it.quantity);
        cur.revenue += Number(it.quantity) * Number(it.unit_price_mad);
        productAgg.set(it.product_id, cur);
      }
    }

    setOrders(
      ordersList.map((o) => ({
        ...o,
        itemCount: itemCountMap.get(o.id) ?? 0,
      })),
    );

    // 4. Top products (resolve names)
    if (productIdSet.size > 0) {
      const { data: prodRows } = await supabase
        .from("products")
        .select("id, name_ar")
        .in("id", Array.from(productIdSet));
      const nameById = new Map(
        (prodRows ?? []).map((r) => [r.id as string, r.name_ar as string]),
      );
      const sorted = Array.from(productAgg.entries())
        .map(([pid, v]) => ({
          product_id: pid,
          name_ar: nameById.get(pid) ?? "—",
          qty: v.qty,
          revenue: v.revenue,
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      setTopProducts(sorted);
    } else {
      setTopProducts([]);
    }

    // 5. Pricing tier
    if (pricing) {
      const t = (pricing as unknown as { pricing_tiers: PricingTierLite | null }).pricing_tiers;
      setTier(t ?? null);
      setCustomDiscount(
        (pricing as { custom_discount_percent: number | null }).custom_discount_percent,
      );
    } else {
      setTier(null);
      setCustomDiscount(null);
    }

    // 6. Auth status (email, last_sign_in_at, banned) via existing edge function
    try {
      const { data: statusData } = await supabase.functions.invoke("create-distributor", {
        body: { action: "get_user_status", userIds: [id] },
      });
      const status = statusData?.statuses?.[id] as
        | { banned: boolean; last_sign_in_at: string | null; email: string | null }
        | undefined;
      if (status) {
        setBanned(!!status.banned);
        setLastSignIn(status.last_sign_in_at);
        setEmail(status.email ?? null);
      }
    } catch {
      /* best-effort */
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const metrics = useMemo(() => {
    const active = orders.filter((o) => o.status !== "cancelled");
    const totalRevenue = active.reduce((s, o) => s + Number(o.total_mad), 0);
    const totalOrders = active.length;
    const avg = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const lastDate = orders[0]?.created_at ?? null;
    const last30 = active.filter(
      (o) => Date.now() - new Date(o.created_at).getTime() <= 30 * 86400_000,
    ).length;
    return { totalOrders, totalRevenue, avg, lastDate, last30 };
  }, [orders]);

  const territoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    allTerritories.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [allTerritories]);

  const availableToAdd = useMemo(
    () => allTerritories.filter((t) => !assignedTerritories.some((a) => a.id === t.id)),
    [allTerritories, assignedTerritories],
  );

  const formatLastLogin = (iso: string | null): string => {
    if (!iso) return "لم يسجل الدخول بعد";
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
    } catch {
      return "—";
    }
  };

  const formatLastOrder = (iso: string | null): string => {
    if (!iso) return "—";
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
    } catch {
      return "—";
    }
  };

  const addTerritory = async () => {
    if (!territoryToAdd || !profile?.company_id) return;
    setAddingTerritory(true);
    const { error } = await supabase.from("distributor_territories").insert({
      distributor_id: id,
      territory_id: territoryToAdd,
      company_id: profile.company_id,
    });
    setAddingTerritory(false);
    if (error) {
      toast.error(error.message ?? "تعذرت إضافة المنطقة");
      return;
    }
    toast.success("تم تعيين المنطقة");
    setTerritoryToAdd("");
    load();
  };

  const removeTerritory = async (territoryId: string) => {
    if (territoryId === profile?.territory_id) {
      toast.error("لا يمكن إزالة المنطقة الأساسية");
      return;
    }
    const { error } = await supabase
      .from("distributor_territories")
      .delete()
      .eq("distributor_id", id)
      .eq("territory_id", territoryId);
    if (error) {
      toast.error(error.message ?? "تعذرت الإزالة");
      return;
    }
    toast.success("تم إلغاء تعيين المنطقة");
    load();
  };

  if (loading) {
    return (
      <div className="space-y-4" dir="rtl">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <p className="text-muted-foreground">لم يُعثر على هذا الموزع.</p>
        <Button
          variant="outline"
          className="mt-4 gap-2"
          onClick={() => navigate({ to: "/admin/distributors" })}
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى القائمة
        </Button>
      </Card>
    );
  }

  const status = banned
    ? { label: "محظور", classes: "bg-destructive/15 text-destructive border-destructive/30" }
    : profile.is_active
      ? {
          label: "مفعّل",
          classes: "bg-success/15 text-success-foreground border-success/30",
        }
      : {
          label: "معطّل",
          classes: "bg-muted text-muted-foreground border-border",
        };

  const effectiveDiscount =
    customDiscount != null
      ? Number(customDiscount)
      : tier
        ? tier.base_discount_percent
        : null;

  // Decide which list route to send the back button to.
  const backTo = isSuperAdmin && viewerCompanyId !== profile.company_id
    ? "/super-admin/distributors"
    : "/admin/distributors";

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header / breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            العودة إلى قائمة العملاء
          </Link>
          <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight truncate">
            {profile.full_name || "عميل بدون اسم"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={status.classes}>
              {banned ? <ShieldOff className="ml-1 h-3 w-3" /> : <ShieldCheck className="ml-1 h-3 w-3" />}
              {status.label}
            </Badge>
            <Badge variant="outline" className="border-primary/30 text-primary">
              {LEVEL_LABELS[profile.level] ?? profile.level}
            </Badge>
            {tier && effectiveDiscount != null && (
              <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                <Tag className="h-3 w-3" />
                {tier.name} — {effectiveDiscount}%
                {customDiscount != null ? " (مخصص)" : ""}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 self-start">
          <Button
            variant="outline"
            className="gap-2 border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#075E54]"
            disabled={!profile.phone}
            onClick={() => {
              setWaPassword("");
              setWaPromptOpen(true);
            }}
            title={!profile.phone ? "لا يوجد رقم هاتف" : "إرسال بيانات الدخول عبر WhatsApp"}
          >
            <MessageCircle className="h-4 w-4" />
            إرسال عبر WhatsApp
          </Button>
          <Button
            className="gap-2"
            onClick={() => navigate({ to: "/admin/create-order/$clientId", params: { clientId: profile.id } })}
          >
            <Plus className="h-4 w-4" />
            إنشاء طلب
          </Button>
        </div>
      </div>

      {/* Distributor information */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">معلومات الموزع</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <InfoRow icon={Building2} label="الشركة" value={companyName ?? "—"} />
          <InfoRow icon={Phone} label="الهاتف" value={profile.phone || "—"} ltr />
          <InfoRow icon={Mail} label="البريد الإلكتروني" value={email ?? "—"} ltr />
          <InfoRow
            icon={MapPin}
            label="المنطقة الأساسية"
            value={
              profile.territory_id
                ? (territoryNameById.get(profile.territory_id) ?? profile.city ?? "—")
                : (profile.city ?? "—")
            }
          />
          <InfoRow
            icon={Calendar}
            label="تاريخ الانضمام"
            value={profile.created_at ? formatDateAr(profile.created_at) : "—"}
          />
          <InfoRow
            icon={Tag}
            label="فئة التسعير"
            value={
              tier && effectiveDiscount != null
                ? `${tier.name} — ${effectiveDiscount}%`
                : "بدون فئة"
            }
          />
        </CardContent>
      </Card>

      {/* Performance metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="إجمالي الطلبات"
          value={String(metrics.totalOrders)}
          icon={ClipboardList}
          accent="primary"
        />
        <StatCard
          label="إجمالي الإيرادات"
          value={formatMAD(metrics.totalRevenue)}
          icon={Wallet}
          accent="success"
        />
        <StatCard
          label="متوسط قيمة الطلب"
          value={formatMAD(metrics.avg)}
          icon={ChartBar}
          accent="muted"
        />
        <StatCard
          label="آخر طلب"
          value={metrics.lastDate ? formatLastOrder(metrics.lastDate) : "—"}
          icon={Clock}
          accent="warning"
        />
      </div>

      {/* Activity */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            نشاط الموزع
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <MiniMetric
            label="آخر تسجيل دخول"
            value={formatLastLogin(lastSignIn)}
          />
          <MiniMetric
            label="آخر طلب"
            value={metrics.lastDate ? formatLastOrder(metrics.lastDate) : "لا يوجد"}
          />
          <MiniMetric
            label="طلبات آخر 30 يومًا"
            value={String(metrics.last30)}
          />
        </CardContent>
      </Card>

      {/* Territory assignment */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            المناطق المخصصة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignedTerritories.length === 0 ? (
            <p className="text-sm text-muted-foreground">لم تُعيَّن أي منطقة بعد.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignedTerritories.map((t) => {
                const isPrimary = t.id === profile.territory_id;
                return (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className="gap-1.5 border-primary/30 text-primary py-1.5 px-2.5"
                  >
                    <MapPin className="h-3 w-3" />
                    <span>{t.name}</span>
                    {isPrimary ? (
                      <span className="text-[10px] text-muted-foreground">(أساسية)</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeTerritory(t.id)}
                        className="hover:text-destructive transition"
                        aria-label={`إزالة ${t.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}

          {availableToAdd.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={territoryToAdd} onValueChange={setTerritoryToAdd}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="اختر منطقة لإضافتها…" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={addTerritory}
                disabled={!territoryToAdd || addingTerritory}
                className="gap-1.5"
              >
                {addingTerritory ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                تعيين
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order history */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            سجل الطلبات
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {orders.length} طلب
          </Badge>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لا توجد طلبات بعد.</p>
          ) : (
            <div className="divide-y">
              {orders.slice(0, 25).map((o) => (
                <Link
                  key={o.id}
                  to="/admin/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{o.order_number}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDateAr(o.created_at)} · {o.itemCount} منتج
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {formatMAD(o.total_mad)}
                    </span>
                    <Badge variant={STATUS_VARIANTS[o.status]} className={STATUS_CLASSES[o.status]}>
                      {STATUS_LABELS[o.status]}
                    </Badge>
                  </div>
                </Link>
              ))}
              {orders.length > 25 && (
                <p className="pt-3 text-xs text-muted-foreground text-center">
                  عرض أحدث 25 طلب من إجمالي {orders.length}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top products */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            أكثر المنتجات طلبًا
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لا توجد بيانات بعد.</p>
          ) : (
            <div className="divide-y">
              {topProducts.map((p, i) => (
                <div key={p.product_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm font-medium truncate">{p.name_ar}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap">
                      {p.qty} وحدة
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {formatMAD(p.revenue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 pt-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">
          النقاط الحالية: {profile.loyalty_points} ·{" "}
          {Number(profile.monthly_sales) > 0 && `مبيعات الشهر: ${formatMAD(profile.monthly_sales)} · `}
          نوع الحساب: {profile.account_type}
          {viewerCompanyId === null && profile.company_id ? " · " : ""}
          {viewerCompanyId === null && profile.company_id ? (
            <Award className="inline h-3 w-3" />
          ) : null}
        </span>
      </div>

      {/* WhatsApp credentials prompt: ask for password / temp code, then open the message dialog */}
      <Dialog open={waPromptOpen} onOpenChange={setWaPromptOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#25D366]" />
              إرسال بيانات الدخول
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              أدخل كلمة المرور (أو الرمز المؤقت) ليتم تضمينها في رسالة WhatsApp.
              لن يتم حفظها.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">كلمة المرور / الرمز</Label>
              <Input
                type="text"
                value={waPassword}
                onChange={(e) => setWaPassword(e.target.value)}
                placeholder="مثال: Temp1234"
                dir="ltr"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setWaPromptOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white"
              disabled={!waPassword.trim()}
              onClick={() => {
                setWaPromptOpen(false);
                setWaCredsOpen(true);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              متابعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {profile && (
        <DistributorCredentialsDialog
          open={waCredsOpen}
          onOpenChange={setWaCredsOpen}
          distributorName={profile.full_name}
          phone={profile.phone ?? ""}
          password={waPassword}
        />
      )}
    </div>
  );

function InfoRow({
  icon: Icon,
  label,
  value,
  ltr,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p
          className="text-sm font-medium truncate"
          dir={ltr ? "ltr" : undefined}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-tight">{value}</p>
    </div>
  );
}
