import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Check, ChevronDown, ClipboardList, Copy, Eye, Loader2, MessageCircle, Repeat2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeWhatsappPhone } from "@/utils/whatsapp";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from "sonner";
import { useRepeatOrder } from "@/hooks/useRepeatOrder";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateTimeAr, STATUS_LABELS, STATUS_VARIANTS, STATUS_CLASSES } from "@/lib/format";
import { buildWhatsAppMessage, buildWhatsappLink } from "@/utils/whatsapp";

export const Route = createFileRoute("/_app/orders")({
  component: OrdersPage,
  head: () => ({ meta: [{ title: "طلباتي — DistribHub" }] }),
});

interface OrderItem {
  id: string;
  quantity: number;
  unit_price_mad: number;
  products: { name_ar: string; image_url: string | null } | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  notes: string | null;
  order_items: OrderItem[];
}

function OrdersPage() {
  const { user } = useAuth();
  const { repeat, loading: repeating } = useRepeatOrder();
  const [orders, setOrders] = useState<Order[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ phone: string | null; city: string | null } | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const savePhone = async () => {
    if (!user) return;
    const trimmed = phoneInput.trim();
    const normalized = normalizeWhatsappPhone(trimmed);
    // Morocco numbers normalize to "212" + 9 digits = 12 digits total.
    if (!normalized || normalized.length < 11 || normalized.length > 13) {
      toast.error("رقم الهاتف غير صالح");
      return;
    }
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: trimmed })
      .eq("id", user.id);
    setSavingPhone(false);
    if (error) {
      toast.error("تعذر حفظ الرقم");
      return;
    }
    setProfile((p) => ({ phone: trimmed, city: p?.city ?? null }));
    setPhoneInput("");
    toast.success("تم حفظ رقم الهاتف");
  };

  const buildMessageFor = (order: Order): string =>
    buildWhatsAppMessage({
      orderNumber: order.order_number,
      createdAt: order.created_at,
      items: order.order_items.map((it) => ({
        name: it.products?.name_ar ?? "—",
        qty: it.quantity,
      })),
      total: Number(order.total_mad),
      city: profile?.city ?? "—",
      phone: profile?.phone ?? "—",
    });

  const handleRepeat = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setRepeatingId(orderId);
    await repeat(orderId, { replaceCart: true });
    setRepeatingId(null);
  };

  const copyOrderNumber = async (e: React.MouseEvent, orderNumber: string, orderId: string) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopiedId(orderId);
      toast.success("تم نسخ رقم الطلب");
      setTimeout(() => setCopiedId((c) => (c === orderId ? null : c)), 1500);
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const openPreview = (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    e.preventDefault();
    setPreviewOrder(order);
  };

  const sendWhatsapp = async (order: Order) => {
    const message = buildMessageFor(order);

    try {
      await navigator.clipboard.writeText(message);
      toast.success("تم نسخ نص الطلب");
    } catch {
      // Non-fatal: still open WhatsApp even if clipboard fails
    }

    const link = buildWhatsappLink(profile?.phone, message);
    const url = link || `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setPreviewOrder(null);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ordersData }, { data: profileData }] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, total_mad, points_earned, created_at, notes, order_items(id, quantity, unit_price_mad, products(name_ar, image_url))")
          .eq("distributor_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("phone, city")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      setOrders((ordersData as unknown as Order[]) ?? []);
      setProfile((profileData as { phone: string | null; city: string | null } | null) ?? null);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">طلباتي</h1>
        <p className="text-sm text-muted-foreground mt-1">سجل جميع طلباتك</p>
      </div>

      {orders.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
          لا توجد طلبات بعد
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="shadow-soft overflow-hidden">
              <Collapsible>
                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between gap-4 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180 shrink-0" />
                    <div className="text-right min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm">{o.order_number}</p>
                        <button
                          type="button"
                          onClick={(e) => copyOrderNumber(e, o.order_number, o.id)}
                          aria-label="نسخ رقم الطلب"
                          className="p-1 -m-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                        >
                          {copiedId === o.id ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDateTimeAr(o.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left">
                      <p className="font-bold">{formatMAD(o.total_mad)}</p>
                      <p className="text-xs text-warning">+{o.points_earned} نقطة</p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[o.status]} className={STATUS_CLASSES[o.status]}>
                      {STATUS_LABELS[o.status]}
                    </Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t divide-y">
                    <div className="p-3 bg-muted/30 flex justify-end gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => openPreview(e, o)}
                        className="text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10"
                      >
                        <Eye className="ml-2 h-4 w-4" />
                        معاينة رسالة WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleRepeat(e, o.id)}
                        disabled={repeating && repeatingId === o.id}
                      >
                        {repeating && repeatingId === o.id ? (
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Repeat2 className="ml-2 h-4 w-4" />
                        )}
                        إعادة هذا الطلب
                      </Button>
                    </div>
                    {o.order_items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3">
                        <img
                          src={item.products?.image_url ?? ""}
                          alt=""
                          className="h-12 w-12 rounded-md object-cover bg-muted"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.products?.name_ar}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} × {formatMAD(item.unit_price_mad)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold">
                          {formatMAD(Number(item.unit_price_mad) * item.quantity)}
                        </p>
                      </div>
                    ))}
                    {o.notes && (
                      <div className="p-3 bg-muted/40">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          ملاحظات التوصيل
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{o.notes}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewOrder} onOpenChange={(open) => !open && setPreviewOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>معاينة رسالة WhatsApp</DialogTitle>
            <DialogDescription>
              راجع النص قبل الإرسال. سيتم نسخه تلقائياً عند الإرسال.
            </DialogDescription>
          </DialogHeader>
          {!profile?.phone && (
            <Alert variant="destructive" className="border-warning/50 bg-warning/10 text-warning-foreground">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning">لا يوجد رقم هاتف في بروفايلك</AlertTitle>
              <AlertDescription className="text-warning-foreground/90">
                أضف رقم WhatsApp ليُستخدم في الرسالة وفي فتح المحادثة.
              </AlertDescription>
              <div className="mt-3 space-y-2">
                <Label htmlFor="wa-phone-inline" className="text-xs">
                  رقم الهاتف (مثال: 0612345678)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="wa-phone-inline"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="0612345678"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="bg-background"
                  />
                  <Button onClick={savePhone} disabled={savingPhone || !phoneInput.trim()}>
                    {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
                  </Button>
                </div>
              </div>
            </Alert>
          )}
          <div className="rounded-md border bg-muted/40 p-3 max-h-[50vh] overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-right" dir="rtl">
              {previewOrder ? buildMessageFor(previewOrder) : ""}
            </pre>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPreviewOrder(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (previewOrder) {
                  setConfirmOrder(previewOrder);
                  setPreviewOrder(null);
                }
              }}
              disabled={!profile?.phone}
              title={!profile?.phone ? "أضف رقم الهاتف أولاً" : undefined}
              className="bg-[#25D366] hover:bg-[#25D366]/90 text-white"
            >
              <MessageCircle className="ml-2 h-4 w-4" />
              إرسال عبر WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmOrder} onOpenChange={(open) => !open && setConfirmOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إرسال الطلب عبر WhatsApp</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد فعلاً إرسال الطلب{" "}
              <span className="font-semibold text-foreground">
                {confirmOrder?.order_number}
              </span>{" "}
              عبر WhatsApp؟ سيتم نسخ النص وفتح المحادثة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmOrder) {
                  const order = confirmOrder;
                  setConfirmOrder(null);
                  void sendWhatsapp(order);
                }
              }}
              className="bg-[#25D366] hover:bg-[#25D366]/90 text-white"
            >
              <MessageCircle className="ml-2 h-4 w-4" />
              نعم، إرسال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
