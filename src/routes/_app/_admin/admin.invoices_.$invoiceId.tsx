import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD, formatDateAr } from "@/lib/format";
import {
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_LABELS,
  downloadInvoicePdf,
} from "@/lib/invoices";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/invoices_/$invoiceId")({
  component: InvoiceDetail,
  head: () => ({ meta: [{ title: "تفاصيل الفاتورة — DistribHub" }] }),
});

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  subtotal_mad: number;
  vat_rate: number;
  vat_amount_mad: number;
  total_mad: number;
  payment_method: string | null;
  notes: string | null;
  pdf_path: string | null;
  paid_at: string | null;
  order_id: string;
  orders: {
    order_number: string;
    order_items: {
      quantity: number;
      unit_price_mad: number;
      products: { name_ar: string; sku: string | null } | null;
    }[];
  } | null;
  profiles: {
    full_name: string;
    phone: string | null;
    city: string | null;
    territories: { name: string } | null;
  } | null;
}

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, issue_date, due_date, subtotal_mad, vat_rate, vat_amount_mad, total_mad, payment_method, notes, pdf_path, paid_at, order_id, " +
          "orders(order_number, order_items(quantity, unit_price_mad, products(name_ar, sku))), " +
          "profiles(full_name, phone, city, territories(name))",
      )
      .eq("id", invoiceId)
      .maybeSingle();
    setInv((data as unknown as Invoice) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [invoiceId]);

  const updateStatus = async (status: string) => {
    if (!inv) return;
    const patch = {
      status: status as "draft" | "issued" | "paid" | "cancelled",
      paid_at: status === "paid" ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from("invoices").update(patch).eq("id", inv.id);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    toast.success("تم التحديث");
    load();
  };

  const handleDownload = async () => {
    if (!inv?.pdf_path) {
      toast.error("لا يوجد ملف PDF");
      return;
    }
    setDownloading(true);
    try {
      await downloadInvoicePdf(inv.pdf_path, `${inv.invoice_number}.pdf`);
    } catch {
      toast.error("تعذر تنزيل الفاتورة");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!inv) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">الفاتورة غير موجودة</p>
        <Button asChild variant="outline">
          <Link to="/admin/invoices">العودة إلى الفواتير</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/invoices" })}>
          <ArrowRight className="h-4 w-4 ml-1" />
          الفواتير
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" dir="ltr">
            {inv.invoice_number}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            صادرة في {formatDateAr(inv.issue_date)}
            {inv.due_date && <> — استحقاق {formatDateAr(inv.due_date)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-sm py-1.5 px-3 ${INVOICE_STATUS_CLASSES[inv.status]}`}>
            {INVOICE_STATUS_LABELS[inv.status]}
          </Badge>
          <Select value={inv.status} onValueChange={updateStatus}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleDownload} disabled={!inv.pdf_path || downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Download className="h-4 w-4 ml-1" />}
            تنزيل PDF
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground">العميل</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">الاسم</p>
            <p className="font-medium">{inv.profiles?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">الهاتف</p>
            <p className="font-medium" dir="ltr">{inv.profiles?.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">المدينة</p>
            <p className="font-medium">
              {inv.profiles?.city || inv.profiles?.territories?.name || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">الطلب</p>
            <Link
              to="/admin/orders/$orderId"
              params={{ orderId: inv.order_id }}
              className="font-medium hover:underline"
              dir="ltr"
            >
              {inv.orders?.order_number ?? "—"}
            </Link>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground">المنتجات</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-right py-2 font-medium">المنتج</th>
                <th className="text-right py-2 font-medium">SKU</th>
                <th className="text-center py-2 font-medium">الكمية</th>
                <th className="text-left py-2 font-medium">سعر الوحدة</th>
                <th className="text-left py-2 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {(inv.orders?.order_items ?? []).map((it, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 font-medium">{it.products?.name_ar ?? "—"}</td>
                  <td className="py-2 text-xs text-muted-foreground" dir="ltr">
                    {it.products?.sku ?? "—"}
                  </td>
                  <td className="py-2 text-center">{it.quantity}</td>
                  <td className="py-2 text-left">{formatMAD(it.unit_price_mad)}</td>
                  <td className="py-2 text-left font-medium">
                    {formatMAD(Number(it.unit_price_mad) * it.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Separator />

        <div className="flex justify-end">
          <div className="w-full sm:w-72 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع قبل الضريبة</span>
              <span>{formatMAD(inv.subtotal_mad)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                الضريبة على القيمة المضافة ({inv.vat_rate}%)
              </span>
              <span>{formatMAD(inv.vat_amount_mad)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>الإجمالي شامل الضريبة</span>
              <span>{formatMAD(inv.total_mad)}</span>
            </div>
          </div>
        </div>
      </Card>

      {inv.notes && (
        <Card className="p-4">
          <h2 className="font-semibold text-sm text-muted-foreground mb-2">ملاحظات</h2>
          <p className="text-sm whitespace-pre-wrap">{inv.notes}</p>
        </Card>
      )}
    </div>
  );
}
