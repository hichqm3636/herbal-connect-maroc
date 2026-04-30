import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  ClipboardList,
  Wallet,
  Clock,
  Package,
  Settings,
  Store,
  Loader2,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatCard } from "@/components/StatCard";
import {
  formatMAD,
  formatDateTimeAr,
  STATUS_LABELS,
  STATUS_CLASSES,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/client")({
  component: ClientDashboard,
  head: () => ({
    meta: [
      { title: "حسابي — Nexora" },
      { name: "description", content: "لوحة تحكم العميل: طلباتك وملفك الشخصي." },
    ],
  }),
});

interface RecentOrder {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  created_at: string;
  payment_status: string;
  companies: {
    id: string;
    name: string;
    display_name: string | null;
    logo_url: string | null;
  } | null;
}

interface ProfileRow {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  avatar_url: string | null;
}

function ClientDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, spent: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: profileData }, { data: orderData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, city, address, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("orders")
          .select(
            `id, order_number, status, total_mad, created_at, payment_status,
             companies:company_id ( id, name, display_name, logo_url )`,
          )
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;
      const allOrders = (orderData ?? []) as unknown as RecentOrder[];
      const pending = allOrders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled",
      ).length;
      const spent = allOrders.reduce((s, o) => s + Number(o.total_mad ?? 0), 0);

      setProfile((profileData ?? null) as ProfileRow | null);
      setOrders(allOrders.slice(0, 5));
      setStats({ total: allOrders.length, pending, spent });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const displayName =
    profile?.full_name?.trim() || user?.email?.split("@")[0] || "عزيزي العميل";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-primary/20">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
              {displayName[0]?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              مرحباً، {displayName} 👋
            </h1>
            <p className="text-sm text-muted-foreground">
              تابع طلباتك وأدر ملفك الشخصي من مكان واحد.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <Settings className="h-4 w-4" />
              الإعدادات
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/vendors">
              <Store className="h-4 w-4" />
              تسوّق الآن
            </Link>
          </Button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="إجمالي الطلبات"
          value={String(stats.total)}
          icon={ClipboardList}
          accent="primary"
        />
        <StatCard
          label="قيد المعالجة"
          value={String(stats.pending)}
          icon={Clock}
          accent="warning"
        />
        <StatCard
          label="إجمالي الإنفاق"
          value={formatMAD(stats.spent)}
          icon={Wallet}
          accent="success"
        />
      </div>

      {/* Profile card */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <User className="h-4 w-4 text-primary" />
            ملفي الشخصي
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings">تعديل</Link>
          </Button>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">الاسم الكامل</dt>
            <dd className="font-medium">{profile?.full_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">البريد الإلكتروني</dt>
            <dd className="font-medium" dir="ltr">
              {user?.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">الهاتف</dt>
            <dd className="font-medium" dir="ltr">
              {profile?.phone || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">المدينة</dt>
            <dd className="font-medium">{profile?.city || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">العنوان</dt>
            <dd className="font-medium">{profile?.address || "—"}</dd>
          </div>
        </dl>
      </Card>

      {/* Recent orders */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShoppingBag className="h-4 w-4 text-primary" />
            آخر الطلبات
          </h2>
          {orders.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/orders">عرض الكل</Link>
            </Button>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">لا توجد طلبات بعد</p>
            <p className="text-xs text-muted-foreground">
              ابدأ بتصفّح البائعين وأنشئ أول طلب لك.
            </p>
            <Button asChild size="sm">
              <Link to="/vendors">
                <Store className="h-4 w-4" />
                تصفّح البائعين
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {orders.map((o) => {
              const vendor =
                o.companies?.display_name || o.companies?.name || "بائع";
              const statusLabel = STATUS_LABELS[o.status] ?? o.status;
              const statusClass = STATUS_CLASSES[o.status] ?? "";
              return (
                <li key={o.id}>
                  <Link
                    to="/orders"
                    search={{ focus: o.id }}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40"
                  >
                    {o.companies?.logo_url ? (
                      <img
                        src={o.companies.logo_url}
                        alt={vendor}
                        className="h-10 w-10 rounded-lg object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Store className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{vendor}</p>
                      <p className="text-xs text-muted-foreground">
                        <span dir="ltr" className="font-mono">
                          #{o.order_number}
                        </span>
                        {" · "}
                        {formatDateTimeAr(o.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] font-medium", statusClass)}
                      >
                        {statusLabel}
                      </Badge>
                      <span className="text-sm font-bold">
                        {formatMAD(o.total_mad)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
