import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, FileText, Check, X, ExternalLink, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateTimeAr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_vendor/vendor/invoices")({
  component: VendorInvoicesPage,
  head: () => ({ meta: [{ title: "الفواتير — Nexora" }] }),
});

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  total_mad: number;
  subtotal_mad: number;
  vat_amount_mad: number;
  issue_date: string;
  due_date: string | null;
  pdf_path: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  buyer_id: string;
  order_id: string;
  buyer: { full_name: string | null; phone: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  issued: "مُصدَرة",
  awaiting_confirmation: "بانتظار التأكيد",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  issued: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  awaiting_confirmation: "bg-warning/15 text-warning-foreground",
  paid: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function VendorInvoicesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ inv: InvoiceRow; url: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `id, invoice_number, status, total_mad, subtotal_mad, vat_amount_mad,
         issue_date, due_date, pdf_path, payment_method, payment_proof_url,
         buyer_id, order_id,
         buyer:profiles!fk_invoices_buyer ( full_name, phone )`
      )
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as unknown as InvoiceRow[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
  }, [user?.id]);

  // Pre-sign payment proofs for inline view
  useEffect(() => {
    const proofs = rows.filter((r) => r.payment_proof_url);
    if (proofs.length === 0) return;
    (async () => {
      const out: Record<string, string> = {};
      for (const r of proofs) {
        if (!r.payment_proof_url) continue;
        const { data } = await supabase.storage
          .from("payment-references")
          .createSignedUrl(r.payment_proof_url, 3600);
        if (data?.signedUrl) out[r.id] = data.signedUrl;
      }
      setProofUrls(out);
    })();
  }, [rows]);

  const downloadPdf = async (inv: InvoiceRow) => {
    if (!inv.pdf_path) {
      toast.error("PDF لم يُنشأ بعد");
      return;
    }
    // Open window synchronously to preserve the user gesture (mobile Safari
    // blocks window.open() called after an await).
    const newTab = window.open("", "_blank");
    setBusy(inv.id);
    const { data, error } = await supabase.storage
      .from("invoices")
      .createSignedUrl(inv.pdf_path, 3600);
    setBusy(null);
    if (error || !data?.signedUrl) {
      if (newTab) newTab.close();
      toast.error(error?.message || "تعذر إنشاء رابط التحميل");
      return;
    }
    if (newTab) {
      newTab.location.href = data.signedUrl;
    } else {
      // Popup blocked — fall back to same-tab navigation.
      window.location.href = data.signedUrl;
    }
  };

  const confirmPayment = async (inv: InvoiceRow) => {
    setBusy(inv.id);
    const { data: invRow } = await supabase
      .from("invoices")
      .select("company_id")
      .eq("id", inv.id)
      .single();
    const companyId = invRow?.company_id;
    if (!companyId) {
      setBusy(null);
      toast.error("تعذر تحديد الشركة");
      return;
    }
    const { error: payErr } = await supabase.from("payments").insert({
      invoice_id: inv.id,
      company_id: companyId,
      amount: inv.total_mad,
      payment_method: "manual",
    } as never);
    if (payErr) {
      setBusy(null);
      toast.error(payErr.message);
      return;
    }
    // update_invoice_paid_status trigger marks invoice as paid automatically
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", inv.id);
    setBusy(null);
    toast.success("تم تأكيد الدفع");
    load();
  };

  const rejectProof = async (inv: InvoiceRow) => {
    setBusy(inv.id);
    const { error } = await supabase
      .from("invoices")
      .update({ status: "issued", payment_proof_url: null })
      .eq("id", inv.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم رفض الإيصال");
    load();
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, awaiting: 0, paid: 0 };
    for (const r of rows) {
      if (r.status === "awaiting_confirmation") c.awaiting++;
      if (r.status === "paid") c.paid++;
    }
    return c;
  }, [rows]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الفواتير</h1>
        <div className="text-sm text-muted-foreground">
          المجموع: {counts.all} • بانتظار التأكيد: {counts.awaiting} • مدفوعة: {counts.paid}
        </div>
      </div>

      {loading ? (
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          لا توجد فواتير بعد.
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((inv) => (
            <Card
              key={inv.id}
              className="p-4 cursor-pointer transition-colors hover:bg-muted/40 active:bg-muted/60"
              onClick={() => downloadPdf(inv)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  downloadPdf(inv);
                }
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-bold">{inv.invoice_number}</span>
                    <Badge className={STATUS_CLASS[inv.status] ?? ""}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    العميل: {inv.buyer?.full_name || "—"} • {formatDateTimeAr(inv.issue_date)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <div className="text-lg font-bold">{formatMAD(inv.total_mad)}</div>
                    <div className="text-[11px] text-muted-foreground">شامل ض.ق.م</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!inv.pdf_path || busy === inv.id}
                    onClick={(e) => { e.stopPropagation(); downloadPdf(inv); }}
                  >
                    {busy === inv.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    تحميل PDF
                  </Button>
                </div>
              </div>

              {!inv.pdf_path && inv.status !== "draft" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  جاري توليد PDF…
                </p>
              )}

              {inv.payment_proof_url && proofUrls[inv.id] && (
                <div
                  className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">إيصال الدفع المرفوع</span>
                    <a
                      href={proofUrls[inv.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      عرض كامل <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {/^.*\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(inv.payment_proof_url) ? (
                    <img
                      src={proofUrls[inv.id]}
                      alt="إيصال الدفع"
                      className="max-h-64 rounded-md border"
                    />
                  ) : (
                    <iframe
                      src={proofUrls[inv.id]}
                      className="w-full h-64 rounded-md border bg-background"
                      title="إيصال الدفع"
                    />
                  )}

                  {inv.status === "awaiting_confirmation" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={busy === inv.id}
                        onClick={() => confirmPayment(inv)}
                      >
                        <Check className="h-4 w-4" /> تأكيد الدفع
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === inv.id}
                        onClick={() => rejectProof(inv)}
                      >
                        <X className="h-4 w-4" /> رفض الإيصال
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
