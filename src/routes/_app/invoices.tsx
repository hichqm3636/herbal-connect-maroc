import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  FileText,
  Download,
  Loader2,
  Filter,
  CalendarIcon,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateAr } from "@/lib/format";
import {
  exportBulkPaymentsCsv,
  exportBulkPaymentsPdf,
  type BulkInvoicePayments,
} from "@/lib/paymentsExport";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
  head: () => ({ meta: [{ title: "فواتيري — DistribHub" }] }),
});

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total_mad: number;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  issued: "صادرة",
  paid: "مدفوعة",
  overdue: "متأخرة",
  cancelled: "ملغاة",
};

function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [dateField, setDateField] = useState<"issue_date" | "due_date">(
    "issue_date",
  );
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, total_mad, issue_date, due_date, paid_at",
        )
        .eq("distributor_id", user.id)
        .order("issue_date", { ascending: false });
      setInvoices((data as Invoice[]) ?? []);
    })();
  }, [user]);

  const filteredInvoices = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
    const toTs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
    return invoices.filter((i) => {
      if (statusFilters.length > 0 && !statusFilters.includes(i.status))
        return false;
      const raw = i[dateField];
      if (fromTs !== null || toTs !== null) {
        if (!raw) return false;
        const ts = new Date(raw).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });
  }, [invoices, statusFilters, dateField, dateFrom, dateTo]);

  const allSelected =
    filteredInvoices.length > 0 &&
    filteredInvoices.every((i) => selected.has(i.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const i of filteredInvoices) next.delete(i.id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const i of filteredInvoices) next.add(i.id);
        return next;
      });
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildBulk = async (): Promise<BulkInvoicePayments[] | null> => {
    if (selected.size === 0) return null;
    const ids = Array.from(selected);
    const { data: payments, error } = await supabase
      .from("payments")
      .select("invoice_id, amount, paid_at, payment_method, payment_reference")
      .in("invoice_id", ids)
      .order("paid_at", { ascending: true });
    if (error) {
      toast.error("تعذر جلب الدفعات");
      return null;
    }
    const byInvoice = new Map<string, typeof payments>();
    for (const p of payments ?? []) {
      const arr = byInvoice.get(p.invoice_id) ?? [];
      arr.push(p);
      byInvoice.set(p.invoice_id, arr);
    }
    const map = new Map(invoices.map((i) => [i.id, i]));
    return ids
      .map((id) => map.get(id))
      .filter((i): i is Invoice => Boolean(i))
      .map((inv) => {
        const rows = (byInvoice.get(inv.id) ?? []).map((p) => ({
          paid_at: p.paid_at,
          amount: Number(p.amount),
          payment_method: p.payment_method,
          payment_reference: p.payment_reference,
        }));
        const paid = rows.reduce((s, r) => s + r.amount, 0);
        return {
          meta: {
            invoice_number: inv.invoice_number,
            client_name: null,
            total: Number(inv.total_mad),
            paid,
            due: Math.max(0, Number(inv.total_mad) - paid),
          },
          rows,
        };
      });
  };

  const onExport = async (kind: "csv" | "pdf") => {
    setExporting(true);
    try {
      const bulk = await buildBulk();
      if (!bulk) return;
      if (kind === "csv") exportBulkPaymentsCsv(bulk);
      else exportBulkPaymentsPdf(bulk);
      toast.success("تم التصدير");
    } finally {
      setExporting(false);
    }
  };

  const totals = useMemo(() => {
    const sel = invoices.filter((i) => selected.has(i.id));
    return {
      count: sel.length,
      total: sel.reduce((s, i) => s + Number(i.total_mad), 0),
    };
  }, [invoices, selected]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          فواتيري
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          سجل الفواتير الصادرة لك
        </p>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          فلترة حسب الحالة
        </div>
        <ToggleGroup
          type="multiple"
          value={statusFilters}
          onValueChange={setStatusFilters}
          className="flex-wrap justify-start"
        >
          <ToggleGroupItem value="paid" size="sm">
            مدفوعة
          </ToggleGroupItem>
          <ToggleGroupItem value="overdue" size="sm">
            متأخرة
          </ToggleGroupItem>
          <ToggleGroupItem value="issued" size="sm">
            صادرة
          </ToggleGroupItem>
        </ToggleGroup>
        {statusFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilters([])}
            className="ms-auto"
          >
            مسح
          </Button>
        )}
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 flex items-center justify-between gap-3 bg-accent/30">
          <div className="text-sm">
            <span className="font-semibold">{totals.count}</span> محددة •{" "}
            {formatMAD(totals.total)}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="ml-2 h-4 w-4" />
                )}
                تصدير الدفعات
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport("csv")}>
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("pdf")}>
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Card>
      )}

      {invoices.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          لا توجد فواتير بعد
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="p-3 border-b flex items-center gap-3">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label="تحديد الكل"
            />
            <span className="text-sm text-muted-foreground">
              تحديد جميع الفواتير
            </span>
          </div>
          <div className="divide-y">
            {filteredInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 flex items-center gap-3 hover:bg-accent/30 transition-colors"
              >
                <Checkbox
                  checked={selected.has(inv.id)}
                  onCheckedChange={() => toggleOne(inv.id)}
                  aria-label={`تحديد ${inv.invoice_number}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">
                      {inv.invoice_number}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDateAr(inv.issue_date)}
                  </p>
                </div>
                <div className="text-left">
                  <p className="font-bold">{formatMAD(inv.total_mad)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
