import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Activity,
  CalendarIcon,
  Download,
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Award,
  Pencil,
  X,
  ShoppingCart,
  Trash2,
  Plus,
  RefreshCw,
  FileText,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/activity")({
  component: AdminActivity,
  head: () => ({ meta: [{ title: "سجل النشاط — هيرباليفي" }] }),
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
  // admin actions
  create_distributor: "إنشاء موزع",
  reset_password: "إعادة تعيين كلمة المرور",
  disable_distributor: "تعطيل حساب",
  enable_distributor: "تفعيل حساب",
  update_distributor: "تعديل بيانات",
  adjust_points: "تعديل نقاط",
  // orders
  order_created: "إنشاء طلب",
  order_updated: "تعديل طلب",
  order_deleted: "حذف طلب",
  order_status_change: "تغيير حالة الطلب",
  order_item_added: "إضافة عنصر للطلب",
  order_item_updated: "تعديل عنصر طلب",
  order_item_removed: "حذف عنصر طلب",
  // loyalty
  loyalty_points_changed: "تغيير نقاط الولاء",
  loyalty_transaction: "معاملة نقاط",
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create_distributor: UserPlus,
  reset_password: KeyRound,
  disable_distributor: ShieldOff,
  enable_distributor: ShieldCheck,
  update_distributor: Pencil,
  adjust_points: Award,
  order_created: ShoppingCart,
  order_updated: Pencil,
  order_deleted: Trash2,
  order_status_change: RefreshCw,
  order_item_added: Plus,
  order_item_updated: Pencil,
  order_item_removed: Trash2,
  loyalty_points_changed: Award,
  loyalty_transaction: Award,
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create_distributor: "default",
  reset_password: "secondary",
  disable_distributor: "destructive",
  enable_distributor: "default",
  update_distributor: "outline",
  adjust_points: "secondary",
  order_created: "default",
  order_updated: "outline",
  order_deleted: "destructive",
  order_status_change: "secondary",
  order_item_added: "outline",
  order_item_updated: "outline",
  order_item_removed: "destructive",
  loyalty_points_changed: "secondary",
  loyalty_transaction: "secondary",
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

const FIELD_LABELS: Record<string, string> = {
  status: "الحالة",
  total_mad: "الإجمالي (د.م.)",
  points_earned: "النقاط المكتسبة",
  payment_method: "طريقة الدفع",
  notes: "ملاحظات",
  admin_notes: "ملاحظات الإدارة",
  quantity: "الكمية",
  unit_price_mad: "سعر الوحدة (د.م.)",
};

const PAGE_SIZE = 50;

function AdminActivity() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [allDistributors, setAllDistributors] = useState<ProfileLite[]>([]);
  const [allAdmins, setAllAdmins] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  // filters
  const [typeFilter, setTypeFilter] = useState<"all" | "orders" | "loyalty" | "admin">("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [distributorFilter, setDistributorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  const [detail, setDetail] = useState<LogRow | null>(null);

  // Load distributor + admin lists once for the filter dropdowns.
  useEffect(() => {
    (async () => {
      const [{ data: dists }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").order("full_name"),
        supabase.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]),
      ]);
      const distList = (dists ?? []) as ProfileLite[];
      setAllDistributors(distList);
      const distMap = Object.fromEntries(distList.map((d) => [d.id, d.full_name || "—"]));
      const adminIds = new Set((roleRows ?? []).map((r) => r.user_id as string));
      setAllAdmins(distList.filter((d) => adminIds.has(d.id)));
      setProfiles((p) => ({ ...distMap, ...p }));
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("admin_activity_log")
      .select("id, admin_id, action, target_user_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (adminFilter !== "all") q = q.eq("admin_id", adminFilter);
    if (distributorFilter !== "all") q = q.eq("target_user_id", distributorFilter);

    if (actionFilter !== "all") {
      q = q.eq("action", actionFilter);
    } else if (typeFilter !== "all") {
      q = q.in("action", TYPE_TO_ACTIONS[typeFilter]);
    }

    if (from) q = q.gte("created_at", from.toISOString());
    if (to) {
      const end = new Date(to);
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

    // Resolve any names not already in the cache.
    const ids = new Set<string>();
    list.forEach((r) => {
      ids.add(r.admin_id);
      if (r.target_user_id) ids.add(r.target_user_id);
    });
    const missing = Array.from(ids).filter((id) => !profiles[id]);
    if (missing.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", missing);
      const map: Record<string, string> = { ...profiles };
      (profs ?? []).forEach((p: ProfileLite) => {
        map[p.id] = p.full_name || "—";
      });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, adminFilter, distributorFilter, actionFilter, from, to, page]);

  // Action options shown in the action dropdown — narrowed by the type filter.
  const actionOptions = useMemo(() => {
    const keys =
      typeFilter === "all" ? Object.keys(ACTION_LABELS) : TYPE_TO_ACTIONS[typeFilter] ?? [];
    return keys.map((k) => [k, ACTION_LABELS[k] ?? k] as const);
  }, [typeFilter]);

  const resetFilters = () => {
    setTypeFilter("all");
    setAdminFilter("all");
    setDistributorFilter("all");
    setActionFilter("all");
    setFrom(undefined);
    setTo(undefined);
    setPage(0);
  };

  const categoryOf = (action: string): string => {
    if (ORDER_ACTIONS.includes(action)) return "طلب";
    if (LOYALTY_ACTIONS.includes(action)) return "نقاط ولاء";
    if (ADMIN_ACTIONS.includes(action)) return "إجراء إداري";
    return "آخر";
  };

  const formatDiff = (meta: Record<string, unknown>): string => {
    const changes = (meta?.changes ?? meta?.diff) as
      | Record<string, { from?: unknown; to?: unknown }>
      | undefined;
    if (changes && typeof changes === "object") {
      return Object.entries(changes)
        .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v?.from ?? "—"} → ${v?.to ?? "—"}`)
        .join(" | ");
    }
    return "";
  };

  const exportCsv = () => {
    if (rows.length === 0) return toast.error("لا توجد بيانات");
    const headers = [
      "التاريخ",
      "النوع",
      "الإجراء",
      "المسؤول",
      "الموزع المستهدف",
      "رقم الطلب",
      "حالة الطلب",
      "إجمالي الطلب (د.م.)",
      "تغيّر النقاط",
      "النقاط قبل",
      "النقاط بعد",
      "السبب",
      "التغييرات",
      "بيانات إضافية",
    ];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) => {
        const m = (r.metadata ?? {}) as Record<string, unknown>;
        const isOrder = ORDER_ACTIONS.includes(r.action);
        const isLoyalty = LOYALTY_ACTIONS.includes(r.action);
        const changes = (m.changes ?? m.diff) as
          | Record<string, { from?: unknown; to?: unknown }>
          | undefined;
        const orderNumber = (m.order_number ?? m.order_id ?? "") as string;
        const orderStatus = isOrder
          ? (changes?.status
              ? `${changes.status.from ?? "—"} → ${changes.status.to ?? "—"}`
              : (m.status ?? "")) as string
          : "";
        const orderTotal = isOrder
          ? (changes?.total_mad
              ? `${changes.total_mad.from ?? "—"} → ${changes.total_mad.to ?? "—"}`
              : (m.total_mad ?? "")) as string
          : "";
        const pointsDelta = isLoyalty
          ? (m.points_delta ?? m.points ?? changes?.loyalty_points
              ? (changes?.loyalty_points
                  ? Number(changes.loyalty_points.to ?? 0) -
                    Number(changes.loyalty_points.from ?? 0)
                  : (m.points_delta ?? m.points ?? ""))
              : "")
          : "";
        const pointsBefore = isLoyalty
          ? (changes?.loyalty_points?.from ?? m.points_before ?? "")
          : "";
        const pointsAfter = isLoyalty
          ? (changes?.loyalty_points?.to ?? m.points_after ?? "")
          : "";
        const reason = (m.reason ?? m.note ?? "") as string;
        // Strip the columns we already broke out from the leftover blob.
        const leftover = { ...m };
        [
          "changes",
          "diff",
          "order_number",
          "order_id",
          "status",
          "total_mad",
          "points_delta",
          "points",
          "points_before",
          "points_after",
          "reason",
          "note",
        ].forEach((k) => delete leftover[k]);

        return [
          format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
          categoryOf(r.action),
          ACTION_LABELS[r.action] ?? r.action,
          profiles[r.admin_id] || r.admin_id,
          r.target_user_id ? profiles[r.target_user_id] || r.target_user_id : "",
          orderNumber,
          orderStatus,
          orderTotal,
          pointsDelta,
          pointsBefore,
          pointsAfter,
          reason,
          formatDiff(m),
          Object.keys(leftover).length ? JSON.stringify(leftover) : "",
        ]
          .map(escape)
          .join(",");
      }),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix =
      typeFilter === "all" ? "all" : typeFilter;
    a.download = `activity-log-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${rows.length} سجل`);
  };

  const exportPdf = () => {
    if (rows.length === 0) return toast.error("لا توجد بيانات");

    // Aggregate totals per category over the currently filtered rows.
    const totals = {
      orders: 0,
      loyalty: 0,
      admin: 0,
      other: 0,
      pointsDelta: 0,
      orderTotalSum: 0,
    };
    const perAction: Record<string, number> = {};
    const adminCounts: Record<string, number> = {};
    const distributorCounts: Record<string, number> = {};
    interface AdminBreakdown {
      orders: number;
      loyalty: number;
      admin: number;
      other: number;
      pointsDelta: number;
      orderTotalSum: number;
      total: number;
    }
    const adminBreakdown: Record<string, AdminBreakdown> = {};
    const ensureAdmin = (id: string): AdminBreakdown => {
      if (!adminBreakdown[id]) {
        adminBreakdown[id] = {
          orders: 0,
          loyalty: 0,
          admin: 0,
          other: 0,
          pointsDelta: 0,
          orderTotalSum: 0,
          total: 0,
        };
      }
      return adminBreakdown[id];
    };
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    rows.forEach((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      const changes = (m.changes ?? m.diff) as
        | Record<string, { from?: unknown; to?: unknown }>
        | undefined;
      perAction[r.action] = (perAction[r.action] ?? 0) + 1;
      adminCounts[r.admin_id] = (adminCounts[r.admin_id] ?? 0) + 1;
      if (r.target_user_id)
        distributorCounts[r.target_user_id] = (distributorCounts[r.target_user_id] ?? 0) + 1;
      const d = new Date(r.created_at);
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
      const ab = ensureAdmin(r.admin_id);
      ab.total++;
      if (ORDER_ACTIONS.includes(r.action)) {
        totals.orders++;
        ab.orders++;
        const t = Number(
          (changes?.total_mad?.to as number | undefined) ?? (m.total_mad as number | undefined),
        );
        if (Number.isFinite(t)) {
          totals.orderTotalSum += t;
          ab.orderTotalSum += t;
        }
      } else if (LOYALTY_ACTIONS.includes(r.action)) {
        totals.loyalty++;
        ab.loyalty++;
        const delta = Number(
          (m.points_delta as number | undefined) ??
            (m.points as number | undefined) ??
            (changes?.loyalty_points
              ? Number(changes.loyalty_points.to ?? 0) -
                Number(changes.loyalty_points.from ?? 0)
              : 0),
        );
        if (Number.isFinite(delta)) {
          totals.pointsDelta += delta;
          ab.pointsDelta += delta;
        }
      } else if (ADMIN_ACTIONS.includes(r.action)) {
        totals.admin++;
        ab.admin++;
      } else {
        totals.other++;
        ab.other++;
      }
    });

    const topList = (counts: Record<string, number>, limit = 5) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

    const escapeHtml = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        c === "&"
          ? "&amp;"
          : c === "<"
            ? "&lt;"
            : c === ">"
              ? "&gt;"
              : c === '"'
                ? "&quot;"
                : "&#39;",
      );

    const filterLines: string[] = [];
    if (typeFilter !== "all")
      filterLines.push(
        `النوع: ${
          typeFilter === "orders"
            ? "الطلبات"
            : typeFilter === "loyalty"
              ? "نقاط الولاء"
              : "إجراءات إدارية"
        }`,
      );
    if (actionFilter !== "all")
      filterLines.push(`الإجراء: ${ACTION_LABELS[actionFilter] ?? actionFilter}`);
    if (adminFilter !== "all") {
      const a = allAdmins.find((x) => x.id === adminFilter);
      filterLines.push(`المسؤول: ${a?.full_name ?? adminFilter}`);
    }
    if (distributorFilter !== "all") {
      const d = allDistributors.find((x) => x.id === distributorFilter);
      filterLines.push(`الموزع: ${d?.full_name ?? distributorFilter}`);
    }
    if (from) filterLines.push(`من: ${format(from, "yyyy-MM-dd")}`);
    if (to) filterLines.push(`إلى: ${format(to, "yyyy-MM-dd")}`);

    const rowsHtml = rows
      .map((r) => {
        const m = (r.metadata ?? {}) as Record<string, unknown>;
        const isOrder = ORDER_ACTIONS.includes(r.action);
        const isLoyalty = LOYALTY_ACTIONS.includes(r.action);
        const changes = (m.changes ?? m.diff) as
          | Record<string, { from?: unknown; to?: unknown }>
          | undefined;
        const orderNumber = (m.order_number ?? m.order_id ?? "") as string;
        const orderStatus = isOrder
          ? changes?.status
            ? `${changes.status.from ?? "—"} → ${changes.status.to ?? "—"}`
            : ((m.status as string | undefined) ?? "")
          : "";
        const orderTotal = isOrder
          ? changes?.total_mad
            ? `${changes.total_mad.from ?? "—"} → ${changes.total_mad.to ?? "—"}`
            : ((m.total_mad as string | number | undefined) ?? "")
          : "";
        const pointsDelta = isLoyalty
          ? ((m.points_delta as number | undefined) ??
            (m.points as number | undefined) ??
            (changes?.loyalty_points
              ? Number(changes.loyalty_points.to ?? 0) -
                Number(changes.loyalty_points.from ?? 0)
              : ""))
          : "";
        return `<tr>
          <td>${escapeHtml(format(new Date(r.created_at), "yyyy-MM-dd HH:mm"))}</td>
          <td>${escapeHtml(
            ORDER_ACTIONS.includes(r.action)
              ? "طلب"
              : LOYALTY_ACTIONS.includes(r.action)
                ? "نقاط"
                : "إداري",
          )}</td>
          <td>${escapeHtml(ACTION_LABELS[r.action] ?? r.action)}</td>
          <td>${escapeHtml(profiles[r.admin_id] || "—")}</td>
          <td>${escapeHtml(r.target_user_id ? profiles[r.target_user_id] || "—" : "")}</td>
          <td>${escapeHtml(String(orderNumber))}</td>
          <td>${escapeHtml(String(orderStatus))}</td>
          <td>${escapeHtml(String(orderTotal))}</td>
          <td>${escapeHtml(String(pointsDelta))}</td>
          <td>${escapeHtml(formatDiff(m))}</td>
        </tr>`;
      })
      .join("");

    const actionBreakdownRows = Object.entries(perAction)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([action, count]) => `<tr>
          <td>${escapeHtml(ACTION_LABELS[action] ?? action)}</td>
          <td>${escapeHtml(
            ORDER_ACTIONS.includes(action)
              ? "طلب"
              : LOYALTY_ACTIONS.includes(action)
                ? "نقاط"
                : ADMIN_ACTIONS.includes(action)
                  ? "إداري"
                  : "آخر",
          )}</td>
          <td>${count}</td>
          <td>${rows.length ? ((count / rows.length) * 100).toFixed(1) + "٪" : "—"}</td>
        </tr>`,
      )
      .join("");

    const topAdminsRows = topList(adminCounts)
      .map(
        ([id, c]) =>
          `<tr><td>${escapeHtml(profiles[id] || id.slice(0, 8))}</td><td>${c}</td></tr>`,
      )
      .join("") || `<tr><td colspan="2">—</td></tr>`;

    const topDistsRows = topList(distributorCounts)
      .map(
        ([id, c]) =>
          `<tr><td>${escapeHtml(profiles[id] || id.slice(0, 8))}</td><td>${c}</td></tr>`,
      )
      .join("") || `<tr><td colspan="2">—</td></tr>`;

    const dateRangeStr =
      minDate && maxDate
        ? `${format(minDate as Date, "yyyy-MM-dd HH:mm")} ← ${format(maxDate as Date, "yyyy-MM-dd HH:mm")}`
        : "—";

    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />
<title>سجل النشاط الإداري</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, "Segoe UI", Tahoma, Arial, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 14px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #18181b; }
  .meta { color: #555; font-size: 12px; margin-bottom: 14px; }
  .filters, .totals { background: #f4f4f5; border: 1px solid #e4e4e7; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
  .filters strong, .totals strong { display: inline-block; min-width: 60px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
  .kpi { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; }
  .kpi .label { font-size: 11px; color: #71717a; margin-bottom: 4px; }
  .kpi .value { font-size: 20px; font-weight: 700; color: #18181b; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d4d4d8; padding: 5px 6px; text-align: right; vertical-align: top; }
  th { background: #18181b; color: #fff; font-weight: 600; font-size: 11px; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 12px; font-size: 10px; color: #71717a; text-align: center; }
  .page-break { page-break-after: always; }
  .cover { min-height: calc(100vh - 24mm); }
  @media print { .no-print { display: none; } }
</style></head><body>

<!-- ============ صفحة الملخص ============ -->
<section class="cover">
  <h1>تقرير سجل التدقيق</h1>
  <div class="meta">
    تاريخ التصدير: ${format(new Date(), "yyyy-MM-dd HH:mm")} ·
    إجمالي السجلات: <strong>${rows.length}</strong> ·
    النطاق الزمني للسجلات: ${escapeHtml(dateRangeStr)}
  </div>

  <div class="filters">
    <strong>الفلاتر المطبقة:</strong>
    ${filterLines.length ? filterLines.map(escapeHtml).join(" · ") : "بدون فلاتر — كل السجلات"}
  </div>

  <h2>المؤشرات الرئيسية</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">طلبات</div><div class="value">${totals.orders}</div></div>
    <div class="kpi"><div class="label">نقاط ولاء</div><div class="value">${totals.loyalty}</div></div>
    <div class="kpi"><div class="label">إجراءات إدارية</div><div class="value">${totals.admin}</div></div>
    <div class="kpi"><div class="label">أخرى</div><div class="value">${totals.other}</div></div>
    <div class="kpi"><div class="label">مجموع تغيّر النقاط</div><div class="value">${totals.pointsDelta}</div></div>
    <div class="kpi"><div class="label">مجموع قيم الطلبات (د.م.)</div><div class="value">${totals.orderTotalSum.toFixed(2)}</div></div>
    <div class="kpi"><div class="label">عدد المسؤولين الفاعلين</div><div class="value">${Object.keys(adminCounts).length}</div></div>
    <div class="kpi"><div class="label">عدد الموزعين المتأثرين</div><div class="value">${Object.keys(distributorCounts).length}</div></div>
  </div>

  <h2>التوزيع حسب الإجراء</h2>
  <table>
    <thead><tr><th>الإجراء</th><th>النوع</th><th>العدد</th><th>النسبة</th></tr></thead>
    <tbody>${actionBreakdownRows || `<tr><td colspan="4">—</td></tr>`}</tbody>
  </table>

  <div class="two-col" style="margin-top:14px;">
    <div>
      <h2>أكثر المسؤولين نشاطاً</h2>
      <table>
        <thead><tr><th>المسؤول</th><th>عدد السجلات</th></tr></thead>
        <tbody>${topAdminsRows}</tbody>
      </table>
    </div>
    <div>
      <h2>أكثر الموزعين تأثراً</h2>
      <table>
        <thead><tr><th>الموزع</th><th>عدد السجلات</th></tr></thead>
        <tbody>${topDistsRows}</tbody>
      </table>
    </div>
  </div>
</section>
<div class="page-break"></div>

<!-- ============ تفاصيل السجلات ============ -->
<h2 style="margin-top:0;">تفاصيل السجلات</h2>
<table>
  <thead><tr>
    <th>التاريخ</th><th>النوع</th><th>الإجراء</th><th>المسؤول</th><th>الموزع</th>
    <th>رقم الطلب</th><th>حالة الطلب</th><th>إجمالي الطلب</th><th>تغيّر النقاط</th><th>التغييرات</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="footer">منصة Nexora — تقرير سجل التدقيق</div>
<script>window.onload = () => { setTimeout(() => window.print(), 300); };<\/script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      toast.error("الرجاء السماح بالنوافذ المنبثقة لتصدير PDF");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    toast.success(`جاري تجهيز PDF لـ ${rows.length} سجل`);
  };

  const filtersActive =
    typeFilter !== "all" ||
    adminFilter !== "all" ||
    distributorFilter !== "all" ||
    actionFilter !== "all" ||
    from !== undefined ||
    to !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">سجل النشاط الإداري</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} سجل {filtersActive ? "(مُصفّى)" : ""}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportPdf}>
            <FileText className="h-4 w-4" />
            تصدير PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-3 shadow-soft">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setPage(0);
              setActionFilter("all");
              setTypeFilter(v as typeof typeFilter);
            }}
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

          <Select value={actionFilter} onValueChange={(v) => { setPage(0); setActionFilter(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="الإجراء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {actionOptions.map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={adminFilter} onValueChange={(v) => { setPage(0); setAdminFilter(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="المسؤول" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المسؤولين</SelectItem>
              {allAdmins.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.full_name || a.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={distributorFilter}
            onValueChange={(v) => { setPage(0); setDistributorFilter(v); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="الموزع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الموزعين</SelectItem>
              {allDistributors.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name || d.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("justify-start text-right font-normal", !from && "text-muted-foreground")}
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {from ? format(from, "yyyy-MM-dd") : "من تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={from}
                onSelect={(d) => { setPage(0); setFrom(d); }}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("justify-start text-right font-normal", !to && "text-muted-foreground")}
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {to ? format(to, "yyyy-MM-dd") : "إلى تاريخ"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={to}
                onSelect={(d) => { setPage(0); setTo(d); }}
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
          لا توجد سجلات مطابقة.
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => {
            const Icon = ACTION_ICONS[r.action] ?? Activity;
            return (
              <Card
                key={r.id}
                className="p-3 shadow-soft cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setDetail(r)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={ACTION_VARIANTS[r.action] ?? "outline"} className="text-[10px]">
                        {ACTION_LABELS[r.action] ?? r.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm mt-1 truncate">
                      <span className="font-medium">{profiles[r.admin_id] || "—"}</span>
                      {r.target_user_id && (
                        <>
                          <span className="text-muted-foreground"> ← </span>
                          <span>{profiles[r.target_user_id] || "—"}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
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

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل السجل</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Row label="التاريخ" value={format(new Date(detail.created_at), "yyyy-MM-dd HH:mm:ss")} />
              <Row label="الإجراء" value={ACTION_LABELS[detail.action] ?? detail.action} />
              <Row label="المسؤول" value={profiles[detail.admin_id] || detail.admin_id} />
              {detail.target_user_id && (
                <Row label="الموزع" value={profiles[detail.target_user_id] || detail.target_user_id} />
              )}
              <ChangesView metadata={detail.metadata ?? {}} />
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  البيانات الكاملة (JSON)
                </summary>
                <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-64 text-left mt-2" dir="ltr">
                  {JSON.stringify(detail.metadata ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

/**
 * Renders the before/after diff stored in metadata.changes (orders/items)
 * or metadata.before / metadata.after (creates, deletes, loyalty changes).
 */
function ChangesView({ metadata }: { metadata: Record<string, unknown> }) {
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const label = (k: string) => FIELD_LABELS[k] ?? k;

  const changes = metadata.changes as Record<string, { before: unknown; after: unknown }> | undefined;
  const before = metadata.before as Record<string, unknown> | unknown | undefined;
  const after = metadata.after as Record<string, unknown> | unknown | undefined;

  // Orders / items: structured per-field diff.
  if (changes && typeof changes === "object" && Object.keys(changes).length > 0) {
    return (
      <div>
        <p className="text-muted-foreground mb-2">التغييرات</p>
        <div className="rounded-md border divide-y">
          {Object.entries(changes).map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-2 p-2 text-xs">
              <span className="font-medium">{label(k)}</span>
              <span className="text-destructive truncate" title={fmt(v.before)}>
                {fmt(v.before)}
              </span>
              <span className="text-primary truncate" title={fmt(v.after)}>
                {fmt(v.after)}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 p-2 text-[10px] uppercase text-muted-foreground bg-muted/40">
            <span>الحقل</span>
            <span>قبل</span>
            <span>بعد</span>
          </div>
        </div>
      </div>
    );
  }

  // Loyalty point updates: scalar before/after.
  if (
    (typeof before === "number" || typeof before === "string") &&
    (typeof after === "number" || typeof after === "string")
  ) {
    const delta = metadata.delta;
    return (
      <div>
        <p className="text-muted-foreground mb-2">التغيير</p>
        <div className="rounded-md border p-3 text-sm flex items-center justify-between gap-3">
          <span className="text-destructive font-semibold">{fmt(before)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-primary font-semibold">{fmt(after)}</span>
          {delta !== undefined && (
            <Badge variant="outline">الفرق: {fmt(delta)}</Badge>
          )}
        </div>
      </div>
    );
  }

  // Snapshot (create / delete) — flat object.
  const snapshot = (after ?? before) as Record<string, unknown> | undefined;
  if (snapshot && typeof snapshot === "object" && Object.keys(snapshot).length > 0) {
    const heading = after ? "البيانات بعد" : "البيانات قبل الحذف";
    return (
      <div>
        <p className="text-muted-foreground mb-2">{heading}</p>
        <div className="rounded-md border divide-y">
          {Object.entries(snapshot).map(([k, v]) => (
            <div key={k} className="grid grid-cols-2 gap-2 p-2 text-xs">
              <span className="font-medium">{label(k)}</span>
              <span className="truncate" title={fmt(v)}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
