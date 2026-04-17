import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Loader2,
  MoreVertical,
  Pencil,
  Search,
  ShieldOff,
  ShieldCheck,
  UserPlus,
  KeyRound,
} from "lucide-react";
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
import { ResetPasswordDialog } from "@/components/admin/ResetPasswordDialog";
import { EditDistributorDialog } from "@/components/admin/EditDistributorDialog";

export const Route = createFileRoute("/_app/_admin/admin/distributors")({
  component: AdminDistributors,
  head: () => ({ meta: [{ title: "إدارة الموزعين — هيرباليفي" }] }),
});

interface Distributor {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  level: string;
  loyalty_points: number;
  monthly_sales: number;
  is_active: boolean;
}

const LEVELS = ["distributor", "senior_consultant", "success_builder", "supervisor", "world_team"];

function AdminDistributors() {
  const { user } = useAuth();
  const [list, setList] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Distributor | null>(null);
  const [resettingPw, setResettingPw] = useState<Distributor | null>(null);
  const [pointsTarget, setPointsTarget] = useState<Distributor | null>(null);
  const [pointsDelta, setPointsDelta] = useState(0);
  const [pointsReason, setPointsReason] = useState("");
  const [pointsSaving, setPointsSaving] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState<Distributor | null>(null);
  const [disabling, setDisabling] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, city, level, loyalty_points, monthly_sales, is_active")
      .order("created_at", { ascending: false });
    setList((data ?? []) as Distributor[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const cities = useMemo(() => {
    const set = new Set<string>();
    list.forEach((d) => d.city && set.add(d.city));
    return Array.from(set).sort();
  }, [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((d) => {
      if (q && !(d.full_name?.toLowerCase().includes(q) || d.phone?.toLowerCase().includes(q)))
        return false;
      if (cityFilter !== "all" && d.city !== cityFilter) return false;
      if (statusFilter === "active" && !d.is_active) return false;
      if (statusFilter === "disabled" && d.is_active) return false;
      return true;
    });
  }, [list, search, cityFilter, statusFilter]);

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
    setPointsSaving(true);
    const newPoints = Math.max(0, pointsTarget.loyalty_points + pointsDelta);
    const { error: e1 } = await supabase
      .from("profiles")
      .update({ loyalty_points: newPoints })
      .eq("id", pointsTarget.id);
    const { error: e2 } = await supabase.from("loyalty_transactions").insert({
      distributor_id: pointsTarget.id,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة الموزعين</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} من {list.length} موزع
          </p>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" />
          إضافة موزع
        </Button>
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
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="المدينة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المدن</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
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
              <SelectItem value="disabled">معطل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا يوجد موزعون مطابقون.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((d) => (
            <Card key={d.id} className="p-4 shadow-soft">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                {/* Identity */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold shrink-0">
                    {d.full_name?.[0] ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{d.full_name || "—"}</p>
                      <Badge variant="secondary" className="text-[10px]">موزع</Badge>
                      {!d.is_active && (
                        <Badge variant="destructive" className="text-[10px]">معطل</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="ltr">
                      {d.phone || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{d.city || "—"}</p>
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
                      <DropdownMenuItem onClick={() => setResettingPw(d)}>
                        <KeyRound className="ml-2 h-4 w-4" />
                        إعادة تعيين كلمة المرور
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {d.is_active ? (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmDisable(d)}
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
      <EditDistributorDialog
        distributor={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      {/* Reset password */}
      <ResetPasswordDialog
        userId={resettingPw?.id ?? null}
        fullName={resettingPw?.full_name}
        onClose={() => setResettingPw(null)}
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
    </div>
  );
}
