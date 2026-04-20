import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, UserCheck, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/sales-agents")({
  component: AdminSalesAgents,
  head: () => ({ meta: [{ title: "مندوبو المبيعات — DistribHub" }] }),
});

interface AgentRow {
  id: string;
  profile_id: string;
  zone_id: string;
  active: boolean;
  created_at: string;
  profile_name: string;
  zone_name: string;
}

interface ProfileLite {
  id: string;
  full_name: string;
}

interface ZoneLite {
  id: string;
  name: string;
}

function AdminSalesAgents() {
  const { companyId } = useAuth();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [zones, setZones] = useState<ZoneLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ profile_id: "", zone_id: "" });

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: agents }, { data: profs }, { data: zs }] = await Promise.all([
      supabase
        .from("sales_agents")
        .select("id, profile_id, zone_id, active, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", companyId)
        .order("full_name"),
      supabase
        .from("territories")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name"),
    ]);
    const profMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    const zoneMap = new Map((zs ?? []).map((z) => [z.id, z.name]));
    setRows(
      (agents ?? []).map((a) => ({
        ...a,
        profile_name: profMap.get(a.profile_id) || "—",
        zone_name: zoneMap.get(a.zone_id) || "—",
      })),
    );
    setProfiles((profs ?? []) as ProfileLite[]);
    setZones((zs ?? []) as ZoneLite[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.profile_name.toLowerCase().includes(q) ||
        r.zone_name.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const onCreate = async () => {
    if (!companyId) return;
    if (!form.profile_id || !form.zone_id) {
      toast.error("اختر المندوب والمنطقة");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("sales_agents").insert({
      company_id: companyId,
      profile_id: form.profile_id,
      zone_id: form.zone_id,
      active: true,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "هذا التعيين موجود مسبقاً" : error.message);
      return;
    }
    toast.success("تم إنشاء التعيين");
    setOpenDialog(false);
    setForm({ profile_id: "", zone_id: "" });
    void load();
  };

  const toggleActive = async (row: AgentRow) => {
    const { error } = await supabase
      .from("sales_agents")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا التعيين؟")) return;
    const { error } = await supabase.from("sales_agents").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("تم الحذف");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            مندوبو المبيعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            عيّن مندوبيك إلى مناطق وفعّل/أوقف نشاطهم
          </p>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              تعيين جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>تعيين مندوب إلى منطقة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>المندوب</Label>
                <Select
                  value={form.profile_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, profile_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المستخدم" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المنطقة</Label>
                <Select
                  value={form.zone_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, zone_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المنطقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                إلغاء
              </Button>
              <Button onClick={onCreate} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4 shadow-soft">
        <Input
          placeholder="ابحث باسم المندوب أو المنطقة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </Card>

      <Card className="p-0 shadow-soft overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">لا توجد تعيينات</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.profile_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {r.zone_name}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={r.active ? "default" : "outline"}>
                    {r.active ? "نشط" : "موقوف"}
                  </Badge>
                  <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
