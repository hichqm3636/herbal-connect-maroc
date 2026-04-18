import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, ExternalLink, Loader2, MapPin, Package, PackageCheck, Phone, Search, X, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  formatMAD,
  formatDateTimeAr,
  STATUS_LABELS,
  STATUS_VARIANTS,
  STATUS_CLASSES,
  ORDER_STATUSES,
} from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/orders")({
  component: AdminOrders,
  head: () => ({ meta: [{ title: "إدارة الطلبات — هيرباليفي" }] }),
});

interface OrderItem {
  quantity: number;
  unit_price_mad: number;
  products: { name_ar: string } | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  distributor_id: string;
  company_id: string;
  notes: string | null;
  admin_notes: string | null;
  companies: { display_name: string | null; name: string } | null;
  profiles: {
    full_name: string;
    phone: string | null;
    city: string | null;
    territory_id: string | null;
    territories: { name: string } | null;
  } | null;
  order_items: OrderItem[];
}

function AdminOrders() {
  const { companyId, isSuperAdmin, user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [distributorFilter, setDistributorFilter] = useState<string>("all");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");

  const load = async () => {
    if (!user) return;
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, status, total_mad, points_earned, created_at, distributor_id, company_id, notes, admin_notes, companies(display_name, name), profiles(full_name, phone, city, territory_id, territories(name)), order_items(quantity, unit_price_mad, products(name_ar))",
      )
      .order("created_at", { ascending: false });
    if (isSuperAdmin) {
      // Super admins see ALL orders across every company.
    } else if (companyId) {
      query = query.eq("company_id", companyId);
    } else {
      // Non-super admin without a company: nothing to show
      setOrders([]);
      return;
    }
    const { data, error } = await query;
    if (error) {
      console.error("[admin.orders] load failed", error);
      toast.error(`تعذر تحميل الطلبات: ${error.message}`);
    }
    setOrders((data as unknown as OrderRow[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [companyId, isSuperAdmin, user?.id]);

  const distributors = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.distributor_id && o.profiles?.full_name) {
        map.set(o.distributor_id, o.profiles.full_name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [orders]);

  const territories = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      const tid = o.profiles?.territory_id;
      const tname = o.profiles?.territories?.name;
      if (tid && tname) map.set(tid, tname);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [orders]);

  const q = search.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (distributorFilter !== "all" && o.distributor_id !== distributorFilter) return false;
    if (territoryFilter !== "all" && o.profiles?.territory_id !== territoryFilter) return false;
    if (!q) return true;
    const name = o.profiles?.full_name?.toLowerCase() ?? "";
    const city = o.profiles?.city?.toLowerCase() ?? "";
    const num = o.order_number?.toLowerCase() ?? "";
    return name.includes(q) || city.includes(q) || num.includes(q);
  });

  const totalValue = filtered.reduce((s, o) => s + Number(o.total_mad ?? 0), 0);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("لا توجد طلبات للتصدير");
      return;
    }
    const headers = [
      "Order Number",
      "Company",
      "Distributor",
      "Phone",
      "City",
      "Territory",
      "Total (MAD)",
      "Status",
      "Created At",
      "Order ID",
      "Points Earned",
      "Items",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map((o) => [
      o.order_number,
      o.companies?.display_name ?? o.companies?.name ?? "",
      o.profiles?.full_name ?? "",
      o.profiles?.phone ?? "",
      o.profiles?.city ?? "",
      o.profiles?.territories?.name ?? "",
      o.total_mad,
      o.status,
      new Date(o.created_at).toISOString(),
      o.id,
      o.points_earned,
      (o.order_items ?? [])
        .map((it) => `${it.products?.name_ar ?? "?"} x${it.quantity}`)
        .join("; "),
    ]);
    const csv =
      "\uFEFF" + [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `orders-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${filtered.length} طلب`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة الطلبات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} من {orders.length} طلب
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4 mr-1" />
          تصدير CSV
        </Button>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">القيمة الإجمالية للطلبات المعروضة</span>
          <span className="text-2xl font-bold text-primary">{formatMAD(totalValue)}</span>
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو الاسم…"
            className="pr-9 pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="مسح البحث"
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={distributorFilter} onValueChange={setDistributorFilter}>
          <SelectTrigger>
            <SelectValue placeholder="الموزع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموزعين</SelectItem>
            {distributors.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="المنطقة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المناطق</SelectItem>
            {territories.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            لا توجد طلبات مطابقة
          </Card>
        ) : (
          filtered.map((o) => (
            <Link
              key={o.id}
              to="/admin/orders/$orderId"
              params={{ orderId: o.id }}
              className="block"
            >
              <Card className="p-4 shadow-soft hover:bg-muted/30 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{o.order_number}</p>
                      <Badge variant={STATUS_VARIANTS[o.status]} className={STATUS_CLASSES[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                      {isSuperAdmin && (
                        <Badge variant="outline" className="font-normal">
                          {o.companies?.display_name || o.companies?.name || "—"}
                        </Badge>
                      )}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">
                      {o.profiles?.full_name || "—"}
                    </p>
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground">
                      {o.profiles?.phone && (
                        <a
                          href={`tel:${o.profiles.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          dir="ltr"
                        >
                          <Phone className="h-3 w-3" />
                          {o.profiles.phone}
                        </a>
                      )}
                      {o.profiles?.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {o.profiles.city}
                        </span>
                      )}
                      {o.profiles?.territories?.name && (
                        <span>{o.profiles.territories.name}</span>
                      )}
                      <span>{formatDateTimeAr(o.created_at)}</span>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-bold">{formatMAD(o.total_mad)}</p>
                    <p className="text-xs text-warning">+{o.points_earned} نقطة</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
