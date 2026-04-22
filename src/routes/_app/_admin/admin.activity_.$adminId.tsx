import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Activity,
  ArrowRight,
  CalendarIcon,
  Loader2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ActivitySearch {
  type?: "all" | "orders" | "loyalty" | "admin";
  action?: string;
  distributor?: string;
  from?: string;
  to?: string;
}

export const Route = createFileRoute("/_app/_admin/admin/activity_/$adminId")({
  component: AdminActivityForUser,
  validateSearch: (raw: Record<string, unknown>): ActivitySearch => {
    const types = ["all", "orders", "loyalty", "admin"] as const;
    const t = raw.type as string | undefined;
    return {
      type: types.includes(t as (typeof types)[number]) ? (t as ActivitySearch["type"]) : "all",
      action: typeof raw.action === "string" ? raw.action : "all",
      distributor: typeof raw.distributor === "string" ? raw.distributor : "all",
      from: typeof raw.from === "string" ? raw.from : undefined,
      to: typeof raw.to === "string" ? raw.to : undefined,
    };
  },
  head: () => ({ meta: [{ title: "سجل المسؤول — هيرباليفي" }] }),
});

interface LogRow {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ProfileLite {
  id: string;
  full_name: string;
}

const ACTION_LABELS: Record<string, string> = {
  create_distributor: "إنشاء موزع",
  reset_password: "إعادة تعيين كلمة المرور",
  disable_distributor: "تعطيل حساب",
  enable_distributor: "تفعيل حساب",
  update_distributor: "تعديل بيانات",
  adjust_points: "تعديل نقاط",
  order_created: "إنشاء طلب",
  order_updated: "تعديل طلب",
  order_deleted: "حذف طلب",
  order_status_change: "تغيير حالة الطلب",
  order_item_added: "إضافة عنصر للطلب",
  order_item_updated: "تعديل عنصر طلب",
  order_item_removed: "حذف عنصر طلب",
  loyalty_points_changed: "تغيير نقاط الولاء",
  loyalty_transaction: "معاملة نقاط",
};

const ORDER_ACTIONS = [
  "order_created",
  "order_updated",
  "order_deleted",
  "order_status_change",
  "order_item_added",
  "order_item_updated",
  "order_item_removed",
];
const LOYALTY_ACTIONS = ["loyalty_points_changed", "loyalty_transaction", "adjust_points"];
const ADMIN_ACTIONS = [
  "create_distributor",
  "reset_password",
  "disable_distributor",
  "enable_distributor",
  "update_distributor",
];

const TYPE_TO_ACTIONS: Record<string, string[]> = {
  orders: ORDER_ACTIONS,
  loyalty: LOYALTY_ACTIONS,
  admin: ADMIN_ACTIONS,
};

const PAGE_SIZE = 50;

function AdminActivityForUser() {
  const { adminId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [adminName, setAdminName] = useState<string>("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [allDistributors, setAllDistributors] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const typeFilter = search.type ?? "all";
  const actionFilter = search.action ?? "all";
  const distributorFilter = search.distributor ?? "all";
  const fromDate = search.from ? new Date(search.from) : undefined;
  const toDate = search.to ? new Date(search.to) : undefined;

  // Resolve admin name + distributor list once.
  useEffect(() => {
    (async () => {
      const [{ data: dists }, { data: me }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").order("full_name"),
        supabase.from("profiles").select("full_name").eq("id", adminId).maybeSingle(),
      ]);
      const distList = (dists ?? []) as ProfileLite[];
      setAllDistributors(distList);
      setProfiles((p) => ({
        ...Object.fromEntries(distList.map((d) => [d.id, d.full_name || "—"])),
        ...p,
      }));
      setAdminName(me?.full_name || adminId.slice(0, 8));
    })();
  }, [adminId]);

  const updateSearch = (patch: Partial<ActivitySearch>) => {
    setPage(0);
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("admin_activity_log")
      .select("id, admin_id, action, target_user_id, metadata, created_at")
      .eq("admin_id", adminId)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (distributorFilter !== "all") q = q.eq("target_user_id", distributorFilter);
    if (actionFilter !== "all") {
      q = q.eq("action", actionFilter);
    } else if (typeFilter !== "all") {
      q = q.in("action", TYPE_TO_ACTIONS[typeFilter]);
    }
    if (fromDate) q = q.gte("created_at", fromDate.toISOString());
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      q = q.lte("created_at", end.toISOString());
    }

    const { data, error } = await q;
    if (error) {
      toast.error("تعذر تحميل السجل");
      setLoading(false);
      return;
    }
    const list = (data ?? []) as LogRow[];
    setHasMore(list.length > PAGE_SIZE);
    setRows(list.slice(0, PAGE_SIZE));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId, typeFilter, actionFilter, distributorFilter, search.from, search.to, page]);

  const actionOptions = useMemo(() => {
    const keys =
      typeFilter === "all" ? Object.keys(ACTION_LABELS) : (TYPE_TO_ACTIONS[typeFilter] ?? []);
    return keys.map((k) => [k, ACTION_LABELS[k] ?? k] as const);
  }, [typeFilter]);

  // Per-category totals scoped to this admin.
  const totals = useMemo(() => {
    const t = { orders: 0, loyalty: 0, admin: 0, other: 0 };
    rows.forEach((r) => {
      if (ORDER_ACTIONS.includes(r.action)) t.orders++;
      else if (LOYALTY_ACTIONS.includes(r.action)) t.loyalty++;
      else if (ADMIN_ACTIONS.includes(r.action)) t.admin++;
      else t.other++;
    });
    return t;
  }, [rows]);

  const filtersActive =
    typeFilter !== "all" ||
    actionFilter !== "all" ||
    distributorFilter !== "all" ||
    fromDate !== undefined ||
    toDate !== undefined;

  const resetFilters = () => {
    setPage(0);
    navigate({ search: {}, replace: true });
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <Link
            to="/admin/activity"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowRight className="h-3 w-3" />
            العودة إلى السجل العام
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
            سجل المسؤول: {adminName || "—"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} سجل {filtersActive ? "(مُصفّى)" : ""}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 shadow-soft">
          <div className="text-xs text-muted-foreground">طلبات</div>
          <div className="text-2xl font-bold">{totals.orders}</div>
        </Card>
        <Card className="p-3 shadow-soft">
          <div className="text-xs text-muted-foreground">نقاط ولاء</div>
          <div className="text-2xl font-bold">{totals.loyalty}</div>
        </Card>
        <Card className="p-3 shadow-soft">
          <div className="text-xs text-muted-foreground">إجراءات إدارية</div>
          <div className="text-2xl font-bold">{totals.admin}</div>
        </Card>
        <Card className="p-3 shadow-soft">
          <div className="text-xs text-muted-foreground">أخرى</div>
          <div className="text-2xl font-bold">{totals.other}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3 shadow-soft">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select
            value={typeFilter}
            onValueChange={(v) =>
              updateSearch({ type: v as ActivitySearch["type"], action: "all" })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="نوع السجل" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="orders">الطلبات</SelectItem>
              <SelectItem value="loyalty">نقاط الولاء</SelectItem>
              <SelectItem value="admin">إجراءات إدارية</SelectItem>
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={(v) => updateSearch({ action: v })}>
            <SelectTrigger>
              <SelectValue placeholder="الإجراء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {actionOptions.map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={distributorFilter}
            onValueChange={(v) => updateSearch({ distributor: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="الموزع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الموزعين</SelectItem>
              {allDistributors.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name || d.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-right font-normal",
                  !fromDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {fromDate ? format(fromDate, "yyyy-MM-dd") : "من تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={(d) => updateSearch({ from: d?.toISOString() })}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-right font-normal",
                  !toDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {toDate ? format(toDate, "yyyy-MM-dd") : "إلى تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={(d) => updateSearch({ to: d?.toISOString() })}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        {filtersActive && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
              <X className="h-3 w-3" />
              مسح الفلاتر
            </Button>
          </div>
        )}
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          لا توجد سجلات لهذا المسؤول ضمن الفلاتر الحالية.
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <Card key={r.id} className="p-3 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground shrink-0">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {ACTION_LABELS[r.action] ?? r.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                    </span>
                  </div>
                  {r.target_user_id && (
                    <p className="text-sm mt-1 truncate">
                      <span className="text-muted-foreground">الموزع: </span>
                      <span className="font-medium">
                        {profiles[r.target_user_id] || r.target_user_id.slice(0, 8)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            السابق
          </Button>
          <span className="text-xs text-muted-foreground">صفحة {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
