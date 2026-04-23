import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Clock,
  Download,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Search,
  ShieldOff,
  ShieldCheck,
  Users,
  UserCheck,
  UserPlus,
  Mail,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { StatCard } from "@/components/StatCard";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, LEVEL_LABELS } from "@/lib/format";
import { toast } from "sonner";
import { CreateDistributorDialog } from "@/components/admin/CreateDistributorDialog";
import { EditClientDialog } from "@/components/admin/EditClientDialog";

export const Route = createFileRoute("/_app/_admin/admin/distributors")({
  component: AdminDistributors,
  head: () => ({ meta: [{ title: "إدارة الموزعين — هيرباليفي" }] }),
});

interface Distributor {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  territory_id: string | null;
  level: string;
  loyalty_points: number;
  monthly_sales: number;
  is_active: boolean;
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

interface DistributorPricingLite {
  distributor_id: string;
  pricing_tier_id: string;
  custom_discount_percent: number | null;
}

const LEVELS = ["distributor", "senior_consultant", "success_builder", "supervisor", "world_team"];

const ROLE_BADGE_LABELS: Record<string, string> = {
  buyer: "مشتري",
  seller: "بائع",
  sales_agent: "مندوب",
  admin: "مسؤول",
  super_admin: "مسؤول عام",
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  buyer: "bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20",
  seller: "bg-success/15 text-success-foreground border border-success/30 hover:bg-success/20",
  sales_agent: "bg-warning/15 text-warning-foreground border border-warning/30 hover:bg-warning/20",
  admin: "bg-secondary text-secondary-foreground",
  super_admin: "bg-destructive/15 text-destructive border border-destructive/30",
};

function AdminDistributors() {
  const { user, companyId } = useAuth();
  const [list, setList] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Distributor | null>(null);
  const [sendingLinkTo, setSendingLinkTo] = useState<string | null>(null);
  const [pointsTarget, setPointsTarget] = useState<Distributor | null>(null);
  const [pointsDelta, setPointsDelta] = useState(0);
  const [pointsReason, setPointsReason] = useState("");
  const [pointsSaving, setPointsSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState<Distributor | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [confirmBan, setConfirmBan] = useState<Distributor | null>(null);
  const [banning, setBanning] = useState(false);

  // auth status keyed by user id
  const [statusMap, setStatusMap] = useState<
    Record<string, { distributor_disabled: boolean; last_sign_in_at: string | null }>
  >({});

  // bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<"enable" | "disable" | "ban" | "unban" | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "buyer" | "seller" | "sales_agent">("all");
  const [territories, setTerritories] = useState<TerritoryLite[]>([]);
  const [tiers, setTiers] = useState<PricingTierLite[]>([]);
  const [pricingByDistributor, setPricingByDistributor] = useState<
    Record<string, DistributorPricingLite>
  >({});
  const [rolesByUser, setRolesByUser] = useState<Record<string, string[]>>({});

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: profs }, { data: terrs }, { data: pTiers }, { data: cdpRows }, { data: roleRows }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, full_name, phone, city, territory_id, level, loyalty_points, monthly_sales, is_active",
          )
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("territories")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name"),
        supabase
          .from("pricing_tiers")
          .select("id, name, base_discount_percent")
          .order("base_discount_percent", { ascending: true }),
        supabase
          .from("company_distributor_pricing")
          .select("distributor_id, pricing_tier_id, custom_discount_percent")
          .eq("company_id", companyId),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .eq("company_id", companyId),
      ]);
    const profiles = (profs ?? []) as Distributor[];
    setList(profiles);
    setTerritories((terrs ?? []) as TerritoryLite[]);
    setTiers((pTiers ?? []) as PricingTierLite[]);
    const cdpMap: Record<string, DistributorPricingLite> = {};
    for (const row of (cdpRows ?? []) as DistributorPricingLite[]) {
      cdpMap[row.distributor_id] = row;
    }
    setPricingByDistributor(cdpMap);
    const rMap: Record<string, string[]> = {};
    for (const row of (roleRows ?? []) as { user_id: string; role: string }[]) {
      (rMap[row.user_id] ??= []).push(row.role);
    }
    setRolesByUser(rMap);
    setLoading(false);

    // Fetch distributor-role status + last sign-in
    if (profiles.length > 0) {
      try {
        const { data } = await supabase.functions.invoke("create-distributor", {
          body: { action: "get_user_status", userIds: profiles.map((p) => p.id) },
        });
        const statuses = (data?.statuses ?? {}) as Record<
          string,
          { distributor_disabled: boolean; last_sign_in_at: string | null }
        >;
        const map: Record<string, { distributor_disabled: boolean; last_sign_in_at: string | null }> = {};
        for (const id of Object.keys(statuses)) {
          map[id] = {
            distributor_disabled: !!statuses[id].distributor_disabled,
            last_sign_in_at: statuses[id].last_sign_in_at ?? null,
          };
        }
        setStatusMap(map);
      } catch {
        /* ignore — auth info is best-effort */
      }
    } else {
      setStatusMap({});
    }
  };

  useEffect(() => {
    load();
  }, [companyId]);

  /**
   * Send a magic-link sign-in email to the distributor.
   * Uses Supabase OTP (passwordless). The link redirects to /auth/callback
   * where the user is routed by role.
   */
  const sendMagicLink = async (d: Distributor) => {
    setSendingLinkTo(d.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: { action: "send_magic_link", userId: d.id },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const j = await ctx.clone().json();
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success(`تم إرسال رابط الدخول إلى ${d.full_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال رابط الدخول");
    } finally {
      setSendingLinkTo(null);
    }
  };

  const territoryById = useMemo(() => {
    const m = new Map<string, string>();
    territories.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [territories]);

  const tierById = useMemo(() => {
    const m = new Map<string, PricingTierLite>();
    tiers.forEach((t) => m.set(t.id, t));
    return m;
  }, [tiers]);

  const summary = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let distributorDisabled = 0;
    for (const d of list) {
      if (statusMap[d.id]?.distributor_disabled) distributorDisabled++;
      else if (d.is_active) active++;
      else inactive++;
    }
    return { total: list.length, active, inactive, distributorDisabled };
  }, [list, statusMap]);

  const roleCounts = useMemo(() => {
    let buyer = 0, seller = 0, sales_agent = 0;
    for (const d of list) {
      const r = rolesByUser[d.id] ?? [];
      if (r.includes("buyer")) buyer++;
      if (r.includes("seller")) seller++;
      if (r.includes("sales_agent")) sales_agent++;
    }
    return { all: list.length, buyer, seller, sales_agent };
  }, [list, rolesByUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((d) => {
      if (q && !(d.full_name?.toLowerCase().includes(q) || d.phone?.toLowerCase().includes(q)))
        return false;
      if (territoryFilter !== "all" && d.territory_id !== territoryFilter) return false;
      if (roleFilter !== "all" && !(rolesByUser[d.id] ?? []).includes(roleFilter)) return false;
      const isDistributorDisabled = !!statusMap[d.id]?.distributor_disabled;
      if (statusFilter === "active" && (!d.is_active || isDistributorDisabled)) return false;
      if (statusFilter === "disabled" && !isDistributorDisabled) return false;
      if (statusFilter === "banned" && !isDistributorDisabled) return false;
      return true;
    });
  }, [list, search, territoryFilter, statusFilter, roleFilter, rolesByUser, statusMap]);

  const formatLastLogin = (iso: string | null | undefined): string => {
    if (!iso) return "لم يسجل الدخول بعد";
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
    } catch {
      return "—";
    }
  };

  const updateLevel = async (id: string, level: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({
        level: level as
          | "distributor"
          | "senior_consultant"
          | "success_builder"
          | "supervisor"
          | "world_team",
      })
      .eq("id", id);
    if (error) return toast.error("تعذر التحديث");
    toast.success("تم تحديث المستوى");
    load();
  };

  const adjustPoints = async () => {
    if (!pointsTarget || !user || pointsDelta === 0) return;
    if (!companyId) {
      toast.error("لا توجد شركة مرتبطة بحسابك");
      return;
    }
    setPointsSaving(true);
    const newPoints = Math.max(0, pointsTarget.loyalty_points + pointsDelta);
    const { error: e1 } = await supabase
      .from("profiles")
      .update({ loyalty_points: newPoints })
      .eq("id", pointsTarget.id);
    const { error: e2 } = await supabase.from("loyalty_transactions").insert({
      distributor_id: pointsTarget.id,
      company_id: companyId,
      points: pointsDelta,
      reason: pointsReason || "تعديل يدوي من الإدارة",
      admin_id: user.id,
    });
    setPointsSaving(false);
    if (e1 || e2) return toast.error("تعذر التعديل");
    toast.success("تم تعديل النقاط");
    setPointsTarget(null);
    setPointsDelta(0);
    setPointsReason("");
    load();
  };

  const toggleActive = async (target: Distributor, makeActive: boolean) => {
    setDisabling(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: { action: "set_active", userId: target.id, isActive: makeActive },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const j = await ctx.clone().json();
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success(makeActive ? "تم تفعيل الحساب" : "تم تعطيل الحساب");
      setConfirmDisable(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشلت العملية");
    } finally {
      setDisabling(false);
    }
  };

  const toggleBanned = async (target: Distributor, makeBanned: boolean) => {
    setBanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: { action: "set_banned", userId: target.id, isBanned: makeBanned },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const j = await ctx.clone().json();
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success(makeBanned ? "تم حظر الحساب" : "تم رفع الحظر");
      setConfirmBan(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشلت العملية");
    } finally {
      setBanning(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((d) => d.id)));
  };

  const runBulkSetActive = async (makeActive: boolean) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: { action: "set_active", userId: id, isActive: makeActive },
      });
      if (error || data?.error) fail++;
      else ok++;
    }
    setBulkBusy(false);
    setBulkConfirm(null);
    setSelected(new Set());
    if (fail === 0) toast.success(`تمت العملية على ${ok} موزع`);
    else toast.error(`نجاح: ${ok} — فشل: ${fail}`);
    load();
  };

  const runBulkSetBanned = async (makeBanned: boolean) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: { action: "set_banned", userId: id, isBanned: makeBanned },
      });
      if (error || data?.error) fail++;
      else ok++;
    }
    setBulkBusy(false);
    setBulkConfirm(null);
    setSelected(new Set());
    if (fail === 0) toast.success(`تمت العملية على ${ok} موزع`);
    else toast.error(`نجاح: ${ok} — فشل: ${fail}`);
    load();
  };

  const exportCsv = () => {
    const rows = selected.size > 0 ? filtered.filter((d) => selected.has(d.id)) : filtered;
    if (rows.length === 0) return toast.error("لا توجد بيانات للتصدير");
    const headers = ["الاسم", "الهاتف", "المنطقة", "المستوى", "النقاط", "المبيعات الشهرية", "الحالة"];
    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((d) =>
        [
          d.full_name,
          d.phone,
          d.territory_id ? (territoryById.get(d.territory_id) ?? "") : (d.city ?? ""),
          LEVEL_LABELS[d.level] ?? d.level,
          d.loyalty_points,
          d.monthly_sales,
          d.is_active ? "مفعل" : "معطل",
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `distributors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${rows.length} موزع`);
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة الموزعين</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} من {list.length} موزع
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button variant="outline" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            تصدير CSV
          </Button>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            إضافة موزع
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="إجمالي الموزعين" value={String(summary.total)} icon={Users} accent="primary" />
        <StatCard label="مفعلون" value={String(summary.active)} icon={ShieldCheck} accent="success" />
        <StatCard label="حسابات معطلة" value={String(summary.inactive)} icon={ShieldOff} accent="muted" />
        <StatCard label="دور الموزع معطل" value={String(summary.distributorDisabled)} icon={UserCheck} accent="warning" />
      </div>

      {/* Quick filter pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "الكل", count: summary.total },
            { key: "active", label: "مفعلون", count: summary.active },
            { key: "disabled", label: "دور الموزع معطل", count: summary.distributorDisabled },
            { key: "banned", label: "حسابات معطلة", count: summary.inactive },
          ] as const
        ).map((pill) => {
          const isActive = statusFilter === pill.key;
          return (
            <Button
              key={pill.key}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              className={cn("gap-1.5", isActive && "shadow-soft")}
              onClick={() => setStatusFilter(pill.key)}
            >
              <span>{pill.label}</span>
              <Badge
                variant="secondary"
                className={cn(
                  "px-1.5 py-0 text-[10px]",
                  isActive && "bg-primary-foreground/20 text-primary-foreground",
                )}
              >
                {pill.count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Role filter pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "كل الأدوار", count: roleCounts.all },
            { key: "buyer", label: "المشترون", count: roleCounts.buyer },
            { key: "seller", label: "البائعون", count: roleCounts.seller },
            { key: "sales_agent", label: "المندوبون", count: roleCounts.sales_agent },
          ] as const
        ).map((pill) => {
          const isActive = roleFilter === pill.key;
          return (
            <Button
              key={pill.key}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              className={cn("gap-1.5", isActive && "shadow-soft")}
              onClick={() => setRoleFilter(pill.key)}
            >
              <span>{pill.label}</span>
              <Badge
                variant="secondary"
                className={cn(
                  "px-1.5 py-0 text-[10px]",
                  isActive && "bg-primary-foreground/20 text-primary-foreground",
                )}
              >
                {pill.count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-3 shadow-soft">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف"
              className="pr-9"
            />
          </div>
          <Select value={territoryFilter} onValueChange={setTerritoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="المنطقة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المناطق</SelectItem>
              {territories.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">مفعل</SelectItem>
              <SelectItem value="disabled">دور الموزع معطل</SelectItem>
              <SelectItem value="banned">الحساب معطل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <Card className="p-3 shadow-soft flex flex-col sm:flex-row sm:items-center gap-3 border-primary/40 bg-accent/30">
          <div className="flex items-center gap-2 flex-1">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="تحديد الكل" />
            <span className="text-sm font-medium">تم تحديد {selected.size} موزع</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              إلغاء التحديد
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={exportCsv} disabled={bulkBusy}>
              <Download className="h-4 w-4" />
              تصدير
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setBulkConfirm("enable")} disabled={bulkBusy}>
              <ShieldCheck className="h-4 w-4" />
              تفعيل
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setBulkConfirm("disable")} disabled={bulkBusy}>
              <ShieldOff className="h-4 w-4" />
              تعطيل
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setBulkConfirm("unban")} disabled={bulkBusy}>
              <UserCheck className="h-4 w-4" />
              تفعيل دور الموزع
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => setBulkConfirm("ban")} disabled={bulkBusy}>
              <ShieldOff className="h-4 w-4" />
              تعطيل دور الموزع
            </Button>
          </div>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا يوجد موزعون مطابقون.</Card>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
              aria-label="تحديد كل الموزعين"
            />
            <span className="text-xs text-muted-foreground">تحديد الكل ({filtered.length})</span>
          </div>
          {filtered.map((d) => (
            <Card key={d.id} className="p-4 shadow-soft">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="flex items-start md:items-center">
                  <Checkbox
                    checked={selected.has(d.id)}
                    onCheckedChange={() => toggleSelect(d.id)}
                    aria-label={`تحديد ${d.full_name}`}
                  />
                </div>
                {/* Identity */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold shrink-0">
                    {d.full_name?.[0] ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/admin/distributors/$id"
                        params={{ id: d.id }}
                        className="font-semibold truncate hover:text-primary hover:underline"
                      >
                        {d.full_name || "—"}
                      </Link>
                      {(rolesByUser[d.id] ?? []).filter((r) => ROLE_BADGE_LABELS[r]).map((r) => (
                        <Badge
                          key={r}
                          variant="secondary"
                          className={`text-[10px] ${ROLE_BADGE_CLASSES[r] ?? ""}`}
                        >
                          {ROLE_BADGE_LABELS[r]}
                        </Badge>
                      ))}
                      {statusMap[d.id]?.distributor_disabled ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning-foreground">
                          <ShieldOff className="h-3 w-3" />
                          دور الموزع معطل
                        </Badge>
                      ) : d.is_active ? (
                        <Badge className="text-[10px] gap-1 bg-success/15 text-success-foreground border border-success/30 hover:bg-success/20">
                          <ShieldCheck className="h-3 w-3" />
                          مفعل
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 border-muted-foreground/40 text-muted-foreground">
                          <ShieldOff className="h-3 w-3" />
                          معطل
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="ltr">
                      {d.phone || "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>آخر دخول:&nbsp;{formatLastLogin(statusMap[d.id]?.last_sign_in_at)}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="gap-1 text-[10px] border-primary/40 text-primary">
                        <MapPin className="h-3 w-3" />
                        {d.territory_id ? (territoryById.get(d.territory_id) ?? d.city ?? "—") : (d.city || "—")}
                      </Badge>
                      {(() => {
                        const cdp = pricingByDistributor[d.id];
                        if (!cdp) return null;
                        const tier = tierById.get(cdp.pricing_tier_id);
                        if (!tier) return null;
                        const effective =
                          cdp.custom_discount_percent != null
                            ? Number(cdp.custom_discount_percent)
                            : tier.base_discount_percent;
                        const isCustom = cdp.custom_discount_percent != null;
                        return (
                          <Badge className="gap-1 text-[10px] bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20">
                            {tier.name} — {effective}%{isCustom ? " (مخصص)" : ""}
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <Badge variant="outline" className="gap-1">
                    <Award className="h-3 w-3" />
                    {d.loyalty_points} نقطة
                  </Badge>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatMAD(d.monthly_sales)}
                  </span>
                  <Select value={d.level} onValueChange={(v) => updateLevel(d.id, v)}>
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="outline" aria-label="إجراءات">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setEditing(d)}>
                        <Pencil className="ml-2 h-4 w-4" />
                        تعديل البيانات
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPointsTarget(d)}>
                        <Award className="ml-2 h-4 w-4" />
                        تعديل النقاط
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sendMagicLink(d)}
                        disabled={sendingLinkTo === d.id}
                      >
                        <Mail className="ml-2 h-4 w-4" />
                        إرسال رابط الدخول
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {(() => {
                        const targetRoles = rolesByUser[d.id] ?? [];
                        const isSelf = user?.id === d.id;
                        const isProtected =
                          targetRoles.includes("admin") ||
                          targetRoles.includes("super_admin");
                        const cannotDisable = isSelf || isProtected;
                        const disableTitle = isSelf
                          ? "لا يمكنك تنفيذ هذا الإجراء على حسابك"
                          : isProtected
                            ? "لا يمكن تعطيل أو حظر حسابات المسؤولين"
                            : undefined;
                        return (
                          <>
                            {d.is_active ? (
                              <DropdownMenuItem
                                disabled={cannotDisable}
                                title={disableTitle}
                                className="text-destructive focus:text-destructive"
                                onClick={() => !cannotDisable && setConfirmDisable(d)}
                              >
                                <ShieldOff className="ml-2 h-4 w-4" />
                                تعطيل الحساب
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => toggleActive(d, true)}>
                                <ShieldCheck className="ml-2 h-4 w-4" />
                                تفعيل الحساب
                              </DropdownMenuItem>
                            )}
                            {statusMap[d.id]?.distributor_disabled ? (
                              <DropdownMenuItem onClick={() => toggleBanned(d, false)}>
                                <UserCheck className="ml-2 h-4 w-4" />
                                تفعيل دور الموزع
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled={cannotDisable}
                                title={disableTitle}
                                className="text-destructive focus:text-destructive"
                                onClick={() => !cannotDisable && setConfirmBan(d)}
                              >
                                <ShieldOff className="ml-2 h-4 w-4" />
                                تعطيل دور الموزع
                              </DropdownMenuItem>
                            )}
                          </>
                        );
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create */}
      <CreateDistributorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
      />

      {/* Edit */}
      <EditClientDialog
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />



      {/* Adjust points */}
      <Dialog open={!!pointsTarget} onOpenChange={(o) => !o && setPointsTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل نقاط {pointsTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              الرصيد الحالي:{" "}
              <span className="font-bold text-foreground">{pointsTarget?.loyalty_points}</span>
            </p>
            <div className="space-y-2">
              <Label>عدد النقاط (موجب لإضافة، سالب لخصم)</Label>
              <Input
                type="number"
                value={pointsDelta}
                onChange={(e) => setPointsDelta(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>السبب</Label>
              <Input
                value={pointsReason}
                onChange={(e) => setPointsReason(e.target.value)}
                placeholder="مكافأة، تصحيح..."
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPointsTarget(null)} disabled={pointsSaving}>
              إلغاء
            </Button>
            <Button onClick={adjustPoints} disabled={pointsSaving || pointsDelta === 0}>
              {pointsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm disable */}
      <AlertDialog open={!!confirmDisable} onOpenChange={(o) => !o && setConfirmDisable(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تعطيل حساب {confirmDisable?.full_name}؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن يتمكن الموزع من تسجيل الدخول حتى تتم إعادة تفعيل حسابه. سيتم الاحتفاظ بجميع
              بياناته وطلباته.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={disabling}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabling}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDisable) toggleActive(confirmDisable, false);
              }}
            >
              {disabling && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              تعطيل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm ban */}
      <AlertDialog open={!!confirmBan} onOpenChange={(o) => !o && setConfirmBan(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حظر حساب {confirmBan?.full_name}؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم منع المستخدم نهائيًا من تسجيل الدخول حتى يتم رفع الحظر يدويًا. لا يؤثر هذا
              على بياناته أو طلباته.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={banning}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={banning}
              onClick={(e) => {
                e.preventDefault();
                if (confirmBan) toggleBanned(confirmBan, true);
              }}
            >
              {banning && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حظر
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk confirm */}
      <AlertDialog open={!!bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirm === "disable" && `تعطيل ${selected.size} موزع؟`}
              {bulkConfirm === "enable" && `تفعيل ${selected.size} موزع؟`}
              {bulkConfirm === "ban" && `حظر ${selected.size} موزع؟`}
              {bulkConfirm === "unban" && `رفع الحظر عن ${selected.size} موزع؟`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirm === "disable" && "سيتم تعطيل جميع الموزعين المحددين. يمكن إعادة تفعيلهم لاحقًا."}
              {bulkConfirm === "enable" && "سيتم إعادة تفعيل جميع الموزعين المحددين."}
              {bulkConfirm === "ban" && "سيتم منع جميع الموزعين المحددين من تسجيل الدخول حتى رفع الحظر."}
              {bulkConfirm === "unban" && "سيتم رفع الحظر عن جميع الموزعين المحددين."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={bulkBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                if (bulkConfirm === "enable" || bulkConfirm === "disable") {
                  runBulkSetActive(bulkConfirm === "enable");
                } else if (bulkConfirm === "ban" || bulkConfirm === "unban") {
                  runBulkSetBanned(bulkConfirm === "ban");
                }
              }}
            >
              {bulkBusy && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
