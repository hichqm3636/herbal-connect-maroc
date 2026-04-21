import { useState } from "react";
import { CalendarIcon, Loader2, Upload } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatMAD } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  card: "بطاقة بنكية",
  stripe: "Stripe",
  manual: "يدوي / أخرى",
};

type PaymentMethod = "cash" | "bank_transfer" | "card" | "stripe" | "manual";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    company_id: string;
    total_mad: number;
  };
  amountDue: number;
  onRecorded: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  amountDue,
  onRecorded,
}: Props) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<string>(amountDue.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState<Date>(new Date());
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAmount(amountDue.toFixed(2));
    setMethod("bank_transfer");
    setReference("");
    setPaidAt(new Date());
    setFile(null);
  };

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("المبلغ غير صحيح");
      return;
    }
    if (amt > amountDue + 0.01) {
      toast.error("المبلغ يتجاوز المتبقي على الفاتورة");
      return;
    }

    setSubmitting(true);
    try {
      let paymentReference = reference.trim() || null;

      // Upload reference file if provided
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${invoice.company_id}/${invoice.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-references")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        // Store the storage path in payment_reference if user didn't fill one
        paymentReference = paymentReference
          ? `${paymentReference} | ${path}`
          : path;
      }

      const { error: insErr } = await supabase.from("payments").insert({
        company_id: invoice.company_id,
        invoice_id: invoice.id,
        amount: amt,
        payment_method: method,
        payment_reference: paymentReference,
        paid_at: paidAt.toISOString(),
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast.success("تم تسجيل الدفع بنجاح");
      reset();
      onOpenChange(false);
      onRecorded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر تسجيل الدفع";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة</DialogTitle>
          <DialogDescription dir="ltr" className="text-right">
            {invoice.invoice_number} — المتبقي {formatMAD(amountDue)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">المبلغ (درهم)</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
              className="text-left"
            />
          </div>

          <div className="space-y-1.5">
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>تاريخ الدفع</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-right font-normal")}
                >
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {format(paidAt, "yyyy-MM-dd")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paidAt}
                  onSelect={(d) => d && setPaidAt(d)}
                  disabled={(date) => date > new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">المرجع (رقم العملية، اختياري)</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="TRX-123456"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-file">إيصال الدفع (اختياري)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="pay-file"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              {file && (
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
            {file && (
              <p className="text-xs text-muted-foreground truncate" dir="ltr">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            تسجيل الدفعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
