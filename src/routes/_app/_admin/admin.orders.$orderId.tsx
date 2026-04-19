import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  PackageCheck,
  Pencil,
  Truck,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import {
  formatMAD,
  formatDateTimeAr,
  STATUS_LABELS,
  STATUS_VARIANTS,
  STATUS_CLASSES,
} from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/orders/$orderId")({
  component: OrderDetails,
  head: () => ({ meta: [{ title: "تفاصيل الطلب — هيرباليفي" }] }),
});

interface ItemRow {
  id: string;
  quantity: number;
  unit_price_mad: number;
  cost_snapshot: number | null;
  products: { id: string; name_ar: string; sku: string | null; image_url: string | null } | null;
}

interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  notes: string | null;
  admin_notes: string | null;
  distributor_id: string;
  company_id: string;
  profiles: {
    full_name: string;
    phone: string | null;
    city: string | null;
    territories: { name: string } | null;
    pricing_tiers: { name: string; discount_percentage: number } | null;
  } | null;
  order_items: ItemRow[];
}

type StatusKey = "confirmed" | "preparing" | "shipped" | "delivered" | "cancelled";

const ACTIONS: {
  status: StatusKey;
  label: string;
  icon: typeof CheckCircle2;
  variant: "default" | "outline" | "destructive";
}[] = [
  { status: "confirmed", label: "الموافقة على الطلب", icon: CheckCircle2, variant: "default" },
  { status: "preparing", label: "قيد التحضير", icon: Package, variant: "outline" },
  { status: "shipped", label: "تم الشحن", icon: Truck, variant: "outline" },
  { status: "delivered", label: "تم التسليم", icon: PackageCheck, variant: "default" },
  { status: "cancelled", label: "إلغاء", icon: XCircle, variant: "destructive" },
];

function OrderDetails() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<StatusKey | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [history, setHistory] = useState<
    { id: string; created_at: string; old_status: string; new_status: string; admin_name: string | null }[]
  >([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, total_mad, points_earned, created_at, notes, admin_notes, distributor_id, company_id, profiles(full_name, phone, city, territories(name), pricing_tiers(name, discount_percentage)), order_items(id, quantity, unit_price_mad, cost_snapshot, products(id, name_ar, sku, image_url))",
      )
      .eq("id", orderId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error || !data) {
      toast.error("تعذر تحميل الطلب");
      setOrder(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    setOrder(data as unknown as OrderDetail);

    const { data: logs } = await supabase
      .from("admin_activity_log")
      .select("id, admin_id, metadata, created_at")
      .eq("company_id", companyId)
      .eq("action", "order_status_change")
      .filter("metadata->>order_id", "eq", orderId)
      .order("created_at", { ascending: true });

    if (logs && logs.length > 0) {
      const adminIds = Array.from(new Set(logs.map((l) => l.admin_id).filter(Boolean)));
      const { data: admins } = adminIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", adminIds)
        : { data: [] as { id: string; full_name: string }[] };
      const nameMap = new Map((admins ?? []).map((a) => [a.id, a.full_name]));
      setHistory(
        logs.map((l) => {
          const meta = (l.metadata ?? {}) as Record<string, unknown>;
          return {
            id: l.id,
            created_at: l.created_at,
            old_status: String(meta.old_status ?? ""),
            new_status: String(meta.new_status ?? ""),
            admin_name: nameMap.get(l.admin_id) ?? null,
          };
        }),
      );
    } else {
      setHistory([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId, companyId]);

  const updateStatus = async (status: StatusKey) => {
    if (!order) return;
    setSaving(status);
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", order.id);
    setSaving(null);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    toast.success(`تم تحديث الحالة: ${STATUS_LABELS[status]}`);
    load();
  };

  const startEditNotes = () => {
    setDraft(order?.admin_notes ?? "");
    setEditingNotes(true);
  };

  const saveNotes = async () => {
    if (!order) return;
    setSavingNotes(true);
    const next = draft.trim() ? draft.trim() : null;
    const { error } = await supabase
      .from("orders")
      .update({ admin_notes: next })
      .eq("id", order.id);
    setSavingNotes(false);
    if (error) {
      toast.error("تعذر حفظ الملاحظة");
      return;
    }
    toast.success("تم حفظ الملاحظة");
    setEditingNotes(false);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">الطلب غير موجود</p>
        <Button asChild variant="outline">
          <Link to="/admin/orders">العودة إلى قائمة الطلبات</Link>
        </Button>
      </Card>
    );
  }

  const itemsTotal = order.order_items.reduce(
    (s, it) => s + Number(it.unit_price_mad) * it.quantity,
    0,
  );

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/admin/orders" })}
        >
          <ArrowRight className="h-4 w-4 ml-1" />
          الطلبات
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{order.order_number}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateTimeAr(order.created_at)}
          </p>
        </div>
        <Badge
          variant={STATUS_VARIANTS[order.status]}
          className={`text-sm py-1.5 px-3 self-start ${STATUS_CLASSES[order.status] ?? ""}`}
        >
          {STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground">معلومات الموزع</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">الاسم</p>
            <p className="font-medium">{order.profiles?.full_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">الهاتف</p>
            <p className="font-medium" dir="ltr">{order.profiles?.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">المنطقة</p>
            <p className="font-medium">{order.profiles?.territories?.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">المدينة</p>
            <p className="font-medium">{order.profiles?.city || "—"}</p>
          </div>
          {order.profiles?.pricing_tiers && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">شريحة الأسعار</p>
              <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">
                {order.profiles.pricing_tiers.name} —{" "}
                {Number(order.profiles.pricing_tiers.discount_percentage)}%
              </Badge>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground">المنتجات</h2>
        <div className="space-y-2">
          {order.order_items.map((it) => {
            const subtotal = Number(it.unit_price_mad) * it.quantity;
            return (
              <div key={it.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                {it.products?.image_url ? (
                  <img
                    src={it.products.image_url}
                    alt={it.products.name_ar}
                    className="h-12 w-12 rounded object-cover bg-muted"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {it.products?.name_ar ?? "منتج محذوف"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMAD(it.unit_price_mad)} × {it.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatMAD(subtotal)}</p>
              </div>
            );
          })}
        </div>
        <Separator />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">المجموع الفرعي</span>
          <span>{formatMAD(itemsTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold">الإجمالي</span>
          <span className="text-xl font-bold text-primary">{formatMAD(order.total_mad)}</span>
        </div>
        <p className="text-xs text-warning text-left">+{order.points_earned} نقطة ولاء</p>
      </Card>

      {order.notes && (
        <Card className="p-4 space-y-1">
          <h2 className="font-semibold text-sm text-muted-foreground">ملاحظات التوصيل</h2>
          <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
        </Card>
      )}

      <Card className="p-4 space-y-2 bg-muted/30">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground">ملاحظات داخلية</h2>
          {!editingNotes && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={startEditNotes}>
              <Pencil className="h-3 w-3 ml-1" />
              تعديل
            </Button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="ملاحظات داخلية للإدارة فقط…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingNotes(false)}
                disabled={savingNotes}
              >
                إلغاء
              </Button>
              <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                حفظ
              </Button>
            </div>
          </div>
        ) : order.admin_notes ? (
          <p className="text-sm whitespace-pre-wrap">{order.admin_notes}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">لا توجد ملاحظات داخلية</p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm text-muted-foreground">سجل تغييرات الحالة</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">لا توجد تغييرات مسجلة بعد</p>
        ) : (
          <ol className="relative border-r border-border pr-4 space-y-4">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -right-[21px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={STATUS_VARIANTS[h.old_status]}
                    className={`text-xs ${STATUS_CLASSES[h.old_status] ?? ""}`}
                  >
                    {STATUS_LABELS[h.old_status] ?? h.old_status}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground rotate-180" />
                  <Badge
                    variant={STATUS_VARIANTS[h.new_status]}
                    className={`text-xs ${STATUS_CLASSES[h.new_status] ?? ""}`}
                  >
                    {STATUS_LABELS[h.new_status] ?? h.new_status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateTimeAr(h.created_at)}
                  {h.admin_name ? ` — ${h.admin_name}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur p-3 shadow-lg md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="container mx-auto md:p-0">
          <p className="text-xs text-muted-foreground mb-2 hidden md:block">إجراءات الطلب</p>
          <div className="flex gap-2 overflow-x-auto md:flex-wrap">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              const disabled = order.status === a.status || saving !== null;
              return (
                <Button
                  key={a.status}
                  variant={a.variant}
                  size="sm"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => {
                    if (a.status === "cancelled") {
                      setConfirmCancel(true);
                    } else {
                      updateStatus(a.status);
                    }
                  }}
                >
                  {saving === a.status ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  ) : (
                    <Icon className="h-4 w-4 ml-1" />
                  )}
                  {a.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الطلب</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد أنك تريد إلغاء هذا الطلب؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmCancel(false);
                updateStatus("cancelled");
              }}
            >
              نعم، ألغِ الطلب
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
