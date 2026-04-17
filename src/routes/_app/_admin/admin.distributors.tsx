import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Award, UserPlus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, LEVEL_LABELS } from "@/lib/format";
import { toast } from "sonner";

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
}

const LEVELS = ["distributor", "senior_consultant", "success_builder", "supervisor", "world_team"];

function AdminDistributors() {
  const { user } = useAuth();
  const [list, setList] = useState<Distributor[]>([]);
  const [editing, setEditing] = useState<Distributor | null>(null);
  const [pointsDelta, setPointsDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDist, setNewDist] = useState({
    fullName: "",
    phone: "",
    city: "",
    email: "",
    password: "",
  });

  const load = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, city, level, loyalty_points, monthly_sales")
      .order("created_at", { ascending: false });
    setList(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const updateLevel = async (id: string, level: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ level: level as "distributor" | "senior_consultant" | "success_builder" | "supervisor" | "world_team" })
      .eq("id", id);
    if (error) {
      toast.error("تعذر التحديث");
      return;
    }
    toast.success("تم تحديث المستوى");
    load();
  };

  const adjustPoints = async () => {
    if (!editing || !user || pointsDelta === 0) return;
    setSaving(true);
    const newPoints = Math.max(0, editing.loyalty_points + pointsDelta);
    const { error: e1 } = await supabase
      .from("profiles")
      .update({ loyalty_points: newPoints })
      .eq("id", editing.id);
    const { error: e2 } = await supabase.from("loyalty_transactions").insert({
      distributor_id: editing.id,
      points: pointsDelta,
      reason: reason || "تعديل يدوي من الإدارة",
      admin_id: user.id,
    });
    setSaving(false);
    if (e1 || e2) {
      toast.error("تعذر التعديل");
      return;
    }
    toast.success("تم تعديل النقاط");
    setEditing(null);
    setPointsDelta(0);
    setReason("");
    load();
  };

  const handleCreate = async () => {
    if (
      !newDist.fullName.trim() ||
      !newDist.phone.trim() ||
      !newDist.city.trim() ||
      !newDist.email.trim() ||
      newDist.password.length < 8
    ) {
      toast.error("املأ جميع الحقول وكلمة مرور 8 أحرف على الأقل");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: newDist,
      });
      if (error) {
        // Try to extract message from edge function response
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const j = await ctx.clone().json();
            if (j?.error) msg = j.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success("تم إنشاء الموزع بنجاح");
      setCreateOpen(false);
      setNewDist({ fullName: "", phone: "", city: "", email: "", password: "" });
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر الإنشاء";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة الموزعين</h1>
          <p className="text-sm text-muted-foreground mt-1">{list.length} موزع</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              إضافة موزع
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إنشاء حساب موزع جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>الاسم الكامل</Label>
                <Input
                  value={newDist.fullName}
                  onChange={(e) => setNewDist({ ...newDist, fullName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>الهاتف</Label>
                  <Input
                    value={newDist.phone}
                    onChange={(e) => setNewDist({ ...newDist, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>المدينة</Label>
                  <Input
                    value={newDist.city}
                    onChange={(e) => setNewDist({ ...newDist, city: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={newDist.email}
                  onChange={(e) => setNewDist({ ...newDist, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور (8+ أحرف، حروف وأرقام)</Label>
                <Input
                  type="text"
                  value={newDist.password}
                  onChange={(e) => setNewDist({ ...newDist, password: e.target.value })}
                  placeholder="شارك كلمة المرور مع الموزع"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                إنشاء الحساب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {list.map((d) => (
          <Card key={d.id} className="p-4 shadow-soft">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground font-semibold shrink-0">
                  {d.full_name?.[0] ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{d.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.phone || "—"} • {d.city || "—"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="gap-1">
                  <Award className="h-3 w-3" />
                  {d.loyalty_points} نقطة
                </Badge>
                <span className="text-sm text-muted-foreground">{formatMAD(d.monthly_sales)}</span>
                <Select value={d.level} onValueChange={(v) => updateLevel(d.id, v)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LEVEL_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setEditing(d)}>
                  تعديل النقاط
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل نقاط {editing?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              الرصيد الحالي: <span className="font-bold text-foreground">{editing?.loyalty_points}</span>
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
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مكافأة، تصحيح..." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={adjustPoints} disabled={saving || pointsDelta === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
