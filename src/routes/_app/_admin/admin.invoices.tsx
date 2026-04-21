import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateAr } from "@/lib/format";
import {
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_LABELS,
  downloadInvoicePdf,
  isInvoiceOverdue,
} from "@/lib/invoices";
import {
  exportBulkPaymentsCsv,
  exportBulkPaymentsPdf,
  type BulkInvoicePayments,
} from "@/lib/paymentsExport";
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
  const { companyId, isSuperAdmin, isAdmin } = useAuth();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const canBulkExport = isAdmin || isSuperAdmin;

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

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return (
          r.invoice_number.toLowerCase().includes(s) ||
          r.orders?.order_number.toLowerCase().includes(s) ||
          r.profiles?.full_name.toLowerCase().includes(s)
        );
      }),
    [rows, statusFilter, search],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((r) => next.delete(r.id));
      } else {
        filtered.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const buildBulkData = async (): Promise<BulkInvoicePayments[] | null> => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("اختر فاتورة واحدة على الأقل");
      return null;
    }
    const { data, error } = await supabase
      .from("payments")
      .select("invoice_id, amount, payment_method, payment_reference, paid_at")
      .in("invoice_id", ids)
      .order("paid_at", { ascending: false });
    if (error) {
      toast.error("تعذر تحميل الدفعات");
      return null;
    }
    const byInvoice = new Map<
      string,
      { paid_at: string; amount: number; payment_method: string; payment_reference: string | null }[]
    >();
    for (const p of (data ?? []) as Array<{
      invoice_id: string;
      paid_at: string;
      amount: number;
      payment_method: string;
      payment_reference: string | null;
    }>) {
      const arr = byInvoice.get(p.invoice_id) ?? [];
      arr.push({
        paid_at: p.paid_at,
        amount: Number(p.amount),
        payment_method: p.payment_method,
        payment_reference: p.payment_reference,
      });
      byInvoice.set(p.invoice_id, arr);
    }

    const selectedRows = rows.filter((r) => selected.has(r.id));
    return selectedRows.map((r) => {
      const payRows = byInvoice.get(r.id) ?? [];
      const paid = payRows.reduce((s, p) => s + Number(p.amount), 0);
      return {
        meta: {
          invoice_number: r.invoice_number,
          client_name: r.profiles?.full_name ?? null,
          total: Number(r.total_mad),
          paid,
          due: Math.max(0, Number(r.total_mad) - paid),
        },
        rows: payRows,
      };
    });
  };

  const handleBulkExport = async (kind: "csv" | "pdf") => {
    setExporting(true);
    try {
      const data = await buildBulkData();
      if (!data) return;
      if (kind === "csv") exportBulkPaymentsCsv(data);
      else exportBulkPaymentsPdf(data);
    } finally {
      setExporting(false);
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

      {canBulkExport && selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-accent/30 p-2.5">
          <p className="text-sm">
            تم تحديد <span className="font-semibold">{selected.size}</span> فاتورة
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  ) : (
                    <Download className="h-4 w-4 ml-1" />
                  )}
                  تصدير الدفعات
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleBulkExport("csv")}>
                  <FileSpreadsheet className="h-4 w-4 ml-2" />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkExport("pdf")}>
                  <FileText className="h-4 w-4 ml-2" />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

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
              <div key={r.id} className="flex items-stretch">
                {canBulkExport && (
                  <div
                    className="flex items-center px-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggleOne(r.id)}
                    />
                  </div>
                )}
                <Link
                  to="/admin/invoices/$invoiceId"
                  params={{ invoiceId: r.id }}
                  className="flex-1 block p-4 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm" dir="ltr">{r.invoice_number}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.profiles?.full_name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateAr(r.issue_date)}</p>
                    </div>
                    <div className="text-left shrink-0 space-y-1">
                      <p className="font-bold text-sm">{formatMAD(r.total_mad)}</p>
                      <Badge variant="outline" className={INVOICE_STATUS_CLASSES[r.status]}>
                        {INVOICE_STATUS_LABELS[r.status]}
                      </Badge>
                      {isInvoiceOverdue(r) && (
                        <Badge variant="outline" className={INVOICE_STATUS_CLASSES.cancelled}>
                          متأخرة
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 z-10">
                <tr className="text-xs text-muted-foreground">
                  {canBulkExport && (
                    <th className="px-3 py-2.5 w-10">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleAll}
                        aria-label="تحديد الكل"
                      />
                    </th>
                  )}
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
                    {canBulkExport && (
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggleOne(r.id)}
                          aria-label={`تحديد ${r.invoice_number}`}
                        />
                      </td>
                    )}
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
                      <div className="inline-flex flex-col items-center gap-1">
                        <Badge variant="outline" className={INVOICE_STATUS_CLASSES[r.status]}>
                          {INVOICE_STATUS_LABELS[r.status]}
                        </Badge>
                        {isInvoiceOverdue(r) && (
                          <Badge variant="outline" className={INVOICE_STATUS_CLASSES.cancelled}>
                            متأخرة
                          </Badge>
                        )}
                      </div>
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
