import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  orderId: string;
  companyId: string;
}

const ACCEPT = "image/jpeg,image/png,application/pdf";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Buyer-facing payment proof uploader.
 * Looks up the latest invoice for the order, uploads the file to
 * `payment-references/{company_id}/{invoice_id}/{filename}`, then sets
 * invoice.status = 'awaiting_confirmation' + payment_proof_url.
 */
export function PaymentProofUploader({ orderId, companyId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<{
    id: string;
    status: string;
    payment_proof_url: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, status, payment_proof_url")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInvoice(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId]);

  if (loading || !invoice) return null;
  if (invoice.status === "paid") return null;
  if (!["issued", "awaiting_confirmation"].includes(invoice.status)) return null;

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("الحد الأقصى لحجم الملف 5 ميغابايت");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const filename = `proof-${Date.now()}.${ext}`;
    const path = `${companyId}/${invoice.id}/${filename}`;

    const { error: upErr } = await supabase.storage
      .from("payment-references")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setBusy(false);
      toast.error(upErr.message);
      return;
    }

    const { error: updErr } = await supabase
      .from("invoices")
      .update({
        payment_proof_url: path,
        status: "awaiting_confirmation",
      } as never)
      .eq("id", invoice.id);

    setBusy(false);
    if (updErr) {
      toast.error(updErr.message);
      return;
    }
    toast.success("تم رفع الإيصال بنجاح، سيتم التحقق خلال 24 ساعة");
    load();
  };

  if (invoice.payment_proof_url && invoice.status === "awaiting_confirmation") {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-warning-foreground bg-warning/15 px-2 py-1 rounded-md">
        <CheckCircle2 className="h-3.5 w-3.5" />
        تم الرفع — بانتظار تأكيد البائع
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        رفع إيصال الدفع
      </Button>
    </>
  );
}
