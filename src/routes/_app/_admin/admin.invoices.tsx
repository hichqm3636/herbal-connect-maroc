import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateAr } from "@/lib/format";
import {
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_LABELS,
  downloadInvoicePdf,
} from "@/lib/invoices";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/invoices")({
  component: InvoicesPage,
  head: () => ({ meta: [{ title: "الفواتير — DistribHub" }] }),
});

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  subtotal_mad: number;
  vat_amount_mad: number;
  total_mad: number;
  pdf_path: string | null;
  order_id: string;
  orders: { order_number: string } | null;
  profiles: { full_name: string; city: string | null } | null;
}

function InvoicesPage() {
  const { companyId, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, issue_date, due_date, subtotal_mad, vat_amount_mad, total_mad, pdf_path, order_id, orders(order_number), profiles(full_name, city)",
        )
        .order("issue_date", { ascending: false });
      if (!isSuperAdmin && companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) {
        toast.error("تعذر تحميل الفواتير");
      }
      setRows((data as unknown as InvoiceRow[]) ?? []);
      setLoading(false);
    })();
  }, [companyId, isSuperAdmin]);

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.invoice_number.toLowerCase().includes(s) ||
      r.orders?.order_number.toLowerCase().includes(s) ||
      r.profiles?.full_name.toLowerCase().includes(s)
    );
  });

  const handleDownload = async (r: InvoiceRow) => {
    if (!r.pdf_path) {
      toast.error("لا يوجد ملف PDF لهذه الفاتورة");
      return;
    }
    setDownloadingId(r.id);
    try {
      await downloadInvoicePdf(r.pdf_path, `${r.invoice_number}.pdf`);
    } catch {
      toast.error("تعذر تنزيل الفاتورة");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">الفواتير</h1>
        <p className="text-sm text-muted-foreground mt-1">
          جميع الفواتير الصادرة عن الطلبات
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="ابحث برقم الفاتورة أو الطلب أو العميل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
          لا توجد فواتير بعد
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y">
            {filtered.map((r) => (
              <Link
                key={r.id}
                to="/admin/invoices/$invoiceId"
                params={{ invoiceId: r.id }}
                className="block p-4 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm" dir="ltr">{r.invoice_number}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.profiles?.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateAr(r.issue_date)}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-bold text-sm">{formatMAD(r.total_mad)}</p>
                    <Badge variant="outline" className={INVOICE_STATUS_CLASSES[r.status]}>
                      {INVOICE_STATUS_LABELS[r.status]}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 z-10">
                <tr className="text-xs text-muted-foreground">
                  <th className="text-right py-2.5 px-3 font-medium">رقم الفاتورة</th>
                  <th className="text-right py-2.5 px-3 font-medium">العميل</th>
                  <th className="text-right py-2.5 px-3 font-medium">المدينة</th>
                  <th className="text-right py-2.5 px-3 font-medium">رقم الطلب</th>
                  <th className="text-right py-2.5 px-3 font-medium">التاريخ</th>
                  <th className="text-left py-2.5 px-3 font-medium">المبلغ</th>
                  <th className="text-center py-2.5 px-3 font-medium">الحالة</th>
                  <th className="text-center py-2.5 px-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/30">
                    <td className="py-2 px-3 font-medium" dir="ltr">
                      <Link
                        to="/admin/invoices/$invoiceId"
                        params={{ invoiceId: r.id }}
                        className="hover:underline"
                      >
                        {r.invoice_number}
                      </Link>
                    </td>
                    <td className="py-2 px-3">{r.profiles?.full_name ?? "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {r.profiles?.city ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground" dir="ltr">
                      {r.orders?.order_number ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {formatDateAr(r.issue_date)}
                    </td>
                    <td className="py-2 px-3 text-left font-semibold">
                      {formatMAD(r.total_mad)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={INVOICE_STATUS_CLASSES[r.status]}>
                        {INVOICE_STATUS_LABELS[r.status]}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(r)}
                        disabled={!r.pdf_path || downloadingId === r.id}
                      >
                        {downloadingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
