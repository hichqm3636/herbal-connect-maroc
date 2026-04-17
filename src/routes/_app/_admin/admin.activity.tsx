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
  create_distributor: "إنشاء موزع",
  reset_password: "إعادة تعيين كلمة المرور",
  disable_distributor: "تعطيل حساب",
  enable_distributor: "تفعيل حساب",
  update_distributor: "تعديل بيانات",
  adjust_points: "تعديل نقاط",
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create_distributor: UserPlus,
  reset_password: KeyRound,
  disable_distributor: ShieldOff,
  enable_distributor: ShieldCheck,
  update_distributor: Pencil,
  adjust_points: Award,
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create_distributor: "default",
  reset_password: "secondary",
  disable_distributor: "destructive",
  enable_distributor: "default",
  update_distributor: "outline",
  adjust_points: "secondary",
};

const PAGE_SIZE = 50;

function AdminActivity() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  // filters
  const [adminFilter, setAdminFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);

  const [detail, setDetail] = useState<LogRow | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("admin_activity_log")
      .select("id, admin_id, action, target_user_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (adminFilter !== "all") q = q.eq("admin_id", adminFilter);
    if (actionFilter !== "all") q = q.eq("action", actionFilter);
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

    // Resolve names
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
  }, [adminFilter, actionFilter, from, to, page]);

  const adminOptions = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach((r) => set.set(r.admin_id, profiles[r.admin_id] || r.admin_id.slice(0, 8)));
    return Array.from(set.entries());
  }, [rows, profiles]);

  const resetFilters = () => {
    setAdminFilter("all");
    setActionFilter("all");
    setFrom(undefined);
    setTo(undefined);
    setPage(0);
  };

  const exportCsv = () => {
    if (rows.length === 0) return toast.error("لا توجد بيانات");
    const headers = ["التاريخ", "المسؤول", "الإجراء", "الهدف", "التفاصيل"];
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
          profiles[r.admin_id] || r.admin_id,
          ACTION_LABELS[r.action] ?? r.action,
          r.target_user_id ? profiles[r.target_user_id] || r.target_user_id : "",
          JSON.stringify(r.metadata ?? {}),
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${rows.length} سجل`);
  };

  const filtersActive =
    adminFilter !== "all" || actionFilter !== "all" || from !== undefined || to !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">سجل النشاط الإداري</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} سجل {filtersActive ? "(مُصفّى)" : ""}
          </p>
        </div>
        <Button variant="outline" className="gap-2 self-start sm:self-auto" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          تصدير CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-3 shadow-soft">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={adminFilter} onValueChange={(v) => { setPage(0); setAdminFilter(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="المسؤول" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المسؤولين</SelectItem>
              {adminOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={(v) => { setPage(0); setActionFilter(v); }}>
            <SelectTrigger>
              <SelectValue placeholder="نوع الإجراء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
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
                <Row label="الهدف" value={profiles[detail.target_user_id] || detail.target_user_id} />
              )}
              <div>
                <p className="text-muted-foreground mb-1">البيانات الإضافية</p>
                <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-64 text-left" dir="ltr">
                  {JSON.stringify(detail.metadata ?? {}, null, 2)}
                </pre>
              </div>
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
