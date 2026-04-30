import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  Users,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  Package,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/super-admin/")({
  component: SuperAdminDashboard,
  head: () => ({ meta: [{ title: "لوحة المنصة — Nexora" }] }),
});

interface Kpis {
  companies: number;
  listedCompanies: number;
  newCompanies7d: number;
  users: number;
  newUsers7d: number;
  orders30d: number;
  ordersPrev30d: number;
  gmv30d: number;
  gmvPrev30d: number;
  activeProducts: number;
  activeSubs: number;
}

interface Alerts {
  pendingOrders: number;
  awaitingPayments: number;
  unlistedCompanies: number;
  trialEnding: number;
}

interface CompanyRow {
  id: string;
  name: string;
  display_name: string;
  brand_color: string;
  logo_url: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  total_mad: number;
  status: string;
  payment_status: string;
  created_at: string;
  company_id: string;
}

function pctDelta(now: number, prev: number): number | null {
  if (prev === 0) return now === 0 ? 0 : null;
  return ((now - prev) / prev) * 100;
}

function SuperAdminDashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [recentCompanies, setRecentCompanies] = useState<CompanyRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const d7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      const d60 = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();
      const trialSoon = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

      const [
        cAll,
        cListed,
        cUnlisted,
        cNew7,
        uAll,
        uNew7,
        oNow,
        oPrev,
        prods,
        subs,
        pending,
        awaiting,
        trials,
        recCo,
        recOrd,
      ] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_listed", true),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_listed", false),
        supabase.from("companies").select("id", { count: "exact", head: true }).gte("created_at", d7),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", d7),
        supabase.from("orders").select("total_mad").gte("created_at", d30),
        supabase.from("orders").select("total_mad").gte("created_at", d60).lt("created_at", d30),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("company_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "awaiting_confirmation"),
        supabase.from("company_subscriptions").select("id", { count: "exact", head: true }).eq("status", "trial").lte("trial_ends_at", trialSoon),
        supabase.from("companies").select("id, name, display_name, brand_color, logo_url, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("orders").select("id, order_number, total_mad, status, payment_status, created_at, company_id").order("created_at", { ascending: false }).limit(6),
      ]);

      if (cancelled) return;

      const sumNow = (oNow.data ?? []).reduce((a, r) => a + Number(r.total_mad ?? 0), 0);
      const sumPrev = (oPrev.data ?? []).reduce((a, r) => a + Number(r.total_mad ?? 0), 0);

      setKpis({
        companies: cAll.count ?? 0,
        listedCompanies: cListed.count ?? 0,
        newCompanies7d: cNew7.count ?? 0,
        users: uAll.count ?? 0,
        newUsers7d: uNew7.count ?? 0,
        orders30d: oNow.data?.length ?? 0,
        ordersPrev30d: oPrev.data?.length ?? 0,
        gmv30d: sumNow,
        gmvPrev30d: sumPrev,
        activeProducts: prods.count ?? 0,
        activeSubs: subs.count ?? 0,
      });

      setAlerts({
        pendingOrders: pending.count ?? 0,
        awaitingPayments: awaiting.count ?? 0,
        unlistedCompanies: cUnlisted.count ?? 0,
        trialEnding: trials.count ?? 0,
      });

      setRecentCompanies((recCo.data as CompanyRow[]) ?? []);
      setRecentOrders((recOrd.data as OrderRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">لوحة المنصة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            رؤية شاملة لصحة المنصة، الشركات، والنشاط الحديث.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/super-admin/companies">إدارة الشركات</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/super-admin/users">إدارة المستخدمين</Link>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="GMV — آخر 30 يوم"
          value={loading ? null : formatMAD(kpis?.gmv30d ?? 0)}
          delta={loading ? null : pctDelta(kpis?.gmv30d ?? 0, kpis?.gmvPrev30d ?? 0)}
          icon={Wallet}
          accent="primary"
        />
        <KpiCard
          label="الطلبات — آخر 30 يوم"
          value={loading ? null : String(kpis?.orders30d ?? 0)}
          delta={loading ? null : pctDelta(kpis?.orders30d ?? 0, kpis?.ordersPrev30d ?? 0)}
          icon={ShoppingCart}
          accent="success"
        />
        <KpiCard
          label="الشركات النشطة"
          value={loading ? null : `${kpis?.listedCompanies ?? 0} / ${kpis?.companies ?? 0}`}
          hint={loading ? undefined : `+${kpis?.newCompanies7d ?? 0} هذا الأسبوع`}
          icon={Building2}
          accent="muted"
        />
        <KpiCard
          label="المستخدمون"
          value={loading ? null : String(kpis?.users ?? 0)}
          hint={loading ? undefined : `+${kpis?.newUsers7d ?? 0} هذا الأسبوع`}
          icon={Users}
          accent="muted"
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat icon={Package} label="منتجات نشطة" value={loading ? "—" : String(kpis?.activeProducts ?? 0)} />
        <MiniStat icon={CheckCircle2} label="اشتراكات نشطة" value={loading ? "—" : String(kpis?.activeSubs ?? 0)} />
        <MiniStat icon={Activity} label="حالة المنصة" value="مستقرة" tone="success" />
      </div>

      {/* Alerts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          <h2 className="font-bold">تنبيهات تتطلب الانتباه</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AlertCard
            icon={Clock}
            title="طلبات قيد الانتظار"
            count={alerts?.pendingOrders ?? 0}
            tone={alerts && alerts.pendingOrders > 0 ? "warning" : "muted"}
            description="لم يبدأ البائع معالجتها بعد."
          />
          <AlertCard
            icon={Wallet}
            title="دفعات بانتظار التأكيد"
            count={alerts?.awaitingPayments ?? 0}
            tone={alerts && alerts.awaitingPayments > 0 ? "warning" : "muted"}
            description="تحويلات بنكية أعلنها العملاء."
          />
          <AlertCard
            icon={Building2}
            title="شركات غير منشورة"
            count={alerts?.unlistedCompanies ?? 0}
            tone="muted"
            description="مخفية من marketplace."
          />
          <AlertCard
            icon={Clock}
            title="تجارب تنتهي قريباً"
            count={alerts?.trialEnding ?? 0}
            tone={alerts && alerts.trialEnding > 0 ? "warning" : "muted"}
            description="خلال 7 أيام."
          />
        </div>
      </section>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent companies */}
        <Card className="p-5 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-bold text-sm">أحدث الشركات</h3>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <Link to="/super-admin/companies">
                الكل
                <ArrowUpRight className="h-3 w-3 mr-1" />
              </Link>
            </Button>
          </div>
          {loading ? (
            <SkeletonRows />
          ) : recentCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد شركات بعد.</p>
          ) : (
            <ul className="divide-y -mx-2">
              {recentCompanies.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                  <div
                    className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                    style={{ backgroundColor: c.brand_color }}
                  >
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.display_name || c.name)[0]
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.display_name || c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("ar-MA")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent orders */}
        <Card className="p-5 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-bold text-sm">أحدث الطلبات</h3>
            </div>
          </div>
          {loading ? (
            <SkeletonRows />
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد طلبات بعد.</p>
          ) : (
            <ul className="divide-y -mx-2">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-2 py-2.5">
                  <div className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center bg-primary/10 text-primary">
                    <ShoppingCart className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{o.order_number}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("ar-MA")}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">{formatMAD(Number(o.total_mad))}</p>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 mt-0.5">
                      {o.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* -------- subcomponents -------- */

function KpiCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: string | null;
  delta?: number | null;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "success" | "muted";
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    muted: "bg-muted text-muted-foreground",
  };
  const showDelta = delta !== undefined && delta !== null;
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="p-4 sm:p-5 shadow-soft hover:shadow-elegant transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight break-words">{value}</p>
          )}
          {showDelta && (
            <p
              className={cn(
                "mt-1 text-[11px] font-medium",
                positive ? "text-success" : "text-destructive",
              )}
            >
              {positive ? "▲" : "▼"} {Math.abs(delta!).toFixed(1)}% vs السابق
            </p>
          )}
          {!showDelta && hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
            accentMap[accent],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "success";
}) {
  return (
    <Card className="p-3 flex items-center gap-3 shadow-soft">
      <div
        className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          tone === "success" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold truncate">{value}</p>
      </div>
    </Card>
  );
}

function AlertCard({
  icon: Icon,
  title,
  count,
  tone,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  tone: "warning" | "muted";
  description: string;
}) {
  const isWarn = tone === "warning";
  return (
    <Card
      className={cn(
        "p-4 shadow-soft border",
        isWarn ? "border-warning/40 bg-warning/[0.04]" : "",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            isWarn ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold">{count}</p>
            <p className="text-xs font-medium truncate">{title}</p>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </Card>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
