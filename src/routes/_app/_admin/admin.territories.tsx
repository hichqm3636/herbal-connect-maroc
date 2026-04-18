import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/territories")({
  component: AdminTerritories,
  head: () => ({ meta: [{ title: "إدارة المناطق — هيرباليفي" }] }),
});

interface Territory {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  distributor_count: number;
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "") || `t-${Date.now().toString(36)}`
  );
}

function AdminTerritories() {
  const [list, setList] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<Territory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Territory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: ts }, { data: profs }] = await Promise.all([
      supabase
        .from("territories")
        .select("id, name, slug, created_at")
        .order("name"),
      supabase.from("profiles").select("territory_id"),
    ]);
    const counts = new Map<string, number>();
    (profs ?? []).forEach((p) => {
      const k = (p as { territory_id: string | null }).territory_id;
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    setList(
      (ts ?? []).map((t) => ({
        ...(t as Omit<Territory, "distributor_count">),
        distributor_count: counts.get((t as { id: string }).id) ?? 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    );
  }, [list, search]);

  const openCreate = () => {
    setForm({ name: "", slug: "" });
    setCreateOpen(true);
  };

  const openEdit = (t: Territory) => {
    setForm({ name: t.name, slug: t.slug });
    setEditing(t);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (name.length < 2) return toast.error("الاسم قصير جداً");
    const slug = (form.slug.trim() || slugify(name)).toLowerCase();
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("territories")
        .update({ name, slug })
        .eq("id", editing.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("تم تحديث المنطقة");
      setEditing(null);
    } else {
      const { error } = await supabase.from("territories").insert({ name, slug });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("تم إنشاء المنطقة");
      setCreateOpen(false);
    }
    load();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.distributor_count > 0) {
      toast.error("لا يمكن حذف منطقة بها موزعون");
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    const { error } = await supabase
      .from("territories")
      .delete()
      .eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    setConfirmDelete(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة المناطق</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} من {list.length} منطقة
          </p>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          إضافة منطقة
        </Button>
      </div>

      <Card className="p-3 shadow-soft">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو المعرّف"
        />
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">لا توجد مناطق.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t.id} className="p-4 shadow-soft flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground shrink-0">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">
                      {t.slug}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">{t.distributor_count} موزع</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1"
                  onClick={() => openEdit(t)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  تعديل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(t)}
                  disabled={t.distributor_count > 0}
                  title={t.distributor_count > 0 ? "لا يمكن الحذف: يوجد موزعون" : ""}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit */}
      <Dialog
        open={createOpen || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المنطقة" : "إضافة منطقة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم المنطقة</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: مراكش"
              />
            </div>
            <div className="space-y-1.5">
              <Label>المعرّف (slug)</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="يُولَّد تلقائياً إذا تُرك فارغاً"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                يُستخدم لاحقاً في توجيه الطلبات تلقائياً.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
              disabled={busy}
            >
              إلغاء
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "حفظ" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف منطقة {confirmDelete?.name}؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء لا يمكن التراجع عنه. تأكد أنه لا يوجد موزعون مرتبطون بهذه المنطقة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
