import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ChevronDown, ClipboardList, Copy, Eye, Loader2, MessageCircle, Repeat2 } from "lucide-react";
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
                    <div className="p-3 bg-muted/30 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleWhatsapp(e, o)}
                        className="text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10"
                      >
                        <MessageCircle className="ml-2 h-4 w-4" />
                        إرسال عبر WhatsApp
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
    </div>
  );
}
