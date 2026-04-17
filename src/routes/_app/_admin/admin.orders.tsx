import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Loader2, Pencil, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD, formatDateTimeAr, STATUS_LABELS, STATUS_VARIANTS } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/orders")({
  component: AdminOrders,
  head: () => ({ meta: [{ title: "إدارة الطلبات — هيرباليفي" }] }),
});

interface OrderItem {
  quantity: number;
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
  notes: string | null;
  admin_notes: string | null;
  profiles: { full_name: string; city: string | null } | null;
  order_items: OrderItem[];
}

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [appendMode, setAppendMode] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, status, total_mad, points_earned, created_at, distributor_id, notes, admin_notes, profiles(full_name, city), order_items(quantity, products(name_ar))")
      .order("created_at", { ascending: false });
    setOrders((data as unknown as OrderRow[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: status as "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("تعذر التحديث");
      return;
    }
    toast.success("تم تحديث حالة الطلب");
    load();
  };

  const startEdit = (o: OrderRow, append: boolean) => {
    setEditingId(o.id);
    setAppendMode(append);
    setDraft(append ? "" : (o.admin_notes ?? ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
    setAppendMode(false);
  };

  const saveAdminNotes = async (o: OrderRow) => {
    const trimmed = draft.trim();
    let next: string | null;
    if (appendMode) {
      if (!trimmed) {
        cancelEdit();
        return;
      }
      const stamp = new Date().toLocaleString("ar-MA");
      const entry = `[${stamp}] ${trimmed}`;
      next = o.admin_notes ? `${o.admin_notes}\n${entry}` : entry;
    } else {
      next = trimmed ? trimmed : null;
    }
    setSavingId(o.id);
    const { error } = await supabase.from("orders").update({ admin_notes: next }).eq("id", o.id);
    setSavingId(null);
    if (error) {
      toast.error("تعذر حفظ الملاحظة");
      return;
    }
    toast.success("تم حفظ الملاحظة الداخلية");
    cancelEdit();
    load();
  };

  const q = search.trim().toLowerCase();
  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (!q) return true;
    const name = o.profiles?.full_name?.toLowerCase() ?? "";
    const city = o.profiles?.city?.toLowerCase() ?? "";
    return name.includes(q) || city.includes(q) || o.id.toLowerCase().startsWith(q);
  });

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("لا توجد طلبات للتصدير");
      return;
    }
    const headers = [
      "Order ID",
      "Created At",
      "Status",
      "Distributor",
      "City",
      "Total (MAD)",
      "Points Earned",
      "Items",
      "Delivery Notes",
      "Admin Notes",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map((o) => [
      o.id,
      new Date(o.created_at).toISOString(),
      o.status,
      o.profiles?.full_name ?? "",
      o.profiles?.city ?? "",
      o.total_mad,
      o.points_earned,
      (o.order_items ?? [])
        .map((it) => `${it.products?.name_ar ?? "?"} x${it.quantity}`)
        .join("; "),
      o.notes ?? "",
      o.admin_notes ?? "",
    ]);
    const csv =
      "\uFEFF" +
      [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
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

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم الموزع، المدينة، أو رقم الطلب…"
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
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
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
        ) : filtered.map((o) => (
          <Card key={o.id} className="p-4 shadow-soft">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">طلب #{o.id.slice(0, 8)}</p>
                  <Badge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {o.profiles?.full_name || "—"} • {o.profiles?.city || "—"} • {formatDateTimeAr(o.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="font-bold">{formatMAD(o.total_mad)}</p>
                  <p className="text-xs text-warning">+{o.points_earned} نقطة</p>
                </div>
                <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {o.notes && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1">ملاحظات التوصيل</p>
                <p className="text-sm whitespace-pre-wrap">{o.notes}</p>
              </div>
            )}
            <div className="mt-3 pt-3 border-t bg-muted/30 -mx-4 -mb-4 px-4 pb-4 rounded-b-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">
                  ملاحظات داخلية (للإدارة فقط)
                </p>
                {editingId !== o.id && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => startEdit(o, true)}
                    >
                      إضافة
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => startEdit(o, false)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      تعديل
                    </Button>
                  </div>
                )}
              </div>
              {editingId === o.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={appendMode ? "إضافة ملاحظة جديدة…" : "تعديل الملاحظات الداخلية…"}
                    rows={3}
                    maxLength={1000}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={cancelEdit} disabled={savingId === o.id}>
                      إلغاء
                    </Button>
                    <Button size="sm" onClick={() => saveAdminNotes(o)} disabled={savingId === o.id}>
                      {savingId === o.id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      حفظ
                    </Button>
                  </div>
                </div>
              ) : o.admin_notes ? (
                <p className="text-sm whitespace-pre-wrap">{o.admin_notes}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">لا توجد ملاحظات داخلية</p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
