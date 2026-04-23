import { useState } from "react";
import { Copy, Check, MessageCircle, Phone, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildDistributorCredentialsMessage,
  buildWhatsappLink,
  normalizeWhatsappPhone,
} from "@/utils/whatsapp";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  distributorName: string;
  phone: string;
  /** Email address the distributor will receive the magic link on. */
  email: string;
  /** Optional override of the login URL shown in the message. */
  loginUrl?: string;
}

/**
 * Reusable dialog that shows a pre-filled WhatsApp message instructing the
 * distributor to check their email for a magic-link sign-in. Gives the admin:
 *   1. "إرسال عبر WhatsApp"  → opens wa.me?text=...
 *   2. "نسخ الرسالة"          → clipboard fallback if WhatsApp won't open
 *
 * The actual sign-in link is delivered by Supabase via email (no password).
 */
export function DistributorCredentialsDialog({
  open,
  onOpenChange,
  distributorName,
  phone,
  email,
  loginUrl,
}: Props) {
  const [copied, setCopied] = useState(false);
  const normalizedPhone = normalizeWhatsappPhone(phone);
  const message = buildDistributorCredentialsMessage({
    distributorName,
    phone,
    email,
    loginUrl,
  });
  const waHref = buildWhatsappLink(phone, message);
  const phoneValid = normalizedPhone.length >= 11; // 212 + 9 digits

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("تم نسخ الرسالة إلى الحافظة");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذر النسخ — انسخ الرسالة يدوياً");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            مشاركة تعليمات الدخول عبر WhatsApp
          </DialogTitle>
          <DialogDescription>
            تم إرسال رابط الدخول إلى بريد العميل. يمكنك أيضاً إخباره عبر
            WhatsApp ليتفقّد بريده.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>البريد الإلكتروني:</span>
              <span dir="ltr" className="font-mono text-foreground">
                {email || "—"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>رقم الإرسال:</span>
              <span dir="ltr" className="font-mono text-foreground">
                {phoneValid ? `+${normalizedPhone}` : "غير صالح"}
              </span>
            </div>
          </div>

          <div
            dir="rtl"
            className="rounded-md border border-[#25D366]/30 bg-[#25D366]/5 p-3 text-sm max-h-[40vh] overflow-y-auto"
          >
            <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
              {message}
            </pre>
          </div>

          {!phoneValid && (
            <p className="text-xs text-destructive">
              رقم الهاتف غير صالح — يمكنك نسخ الرسالة وإرسالها يدوياً.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={copyMessage} className="gap-2">
            {copied ? (
              <Check className="h-4 w-4 text-success-foreground" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "تم النسخ" : "نسخ الرسالة"}
          </Button>
          <Button
            asChild={phoneValid}
            disabled={!phoneValid}
            className="gap-2 bg-[#25D366] hover:bg-[#1ebe5b] text-white"
          >
            {phoneValid ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onOpenChange(false)}
              >
                <MessageCircle className="h-4 w-4" />
                إرسال عبر WhatsApp
              </a>
            ) : (
              <span>
                <MessageCircle className="h-4 w-4" />
                إرسال عبر WhatsApp
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
