import { useState, type ComponentType } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { buildWhatsappLink, normalizeWhatsappPhone } from "@/utils/whatsapp";
import { cn } from "@/lib/utils";

interface WhatsappContactButtonProps extends Omit<ButtonProps, "onClick" | "asChild"> {
  phone: string | null | undefined;
  message: string;
  label?: string;
  /** Show an expandable preview of the pre-filled message. Default: true. */
  showPreview?: boolean;
  /** Optional Lucide icon override (defaults to MessageCircle). */
  icon?: ComponentType<{ className?: string }>;
}

/**
 * Renders a "Notify via WhatsApp" button that opens a wa.me link in a new tab,
 * with an expandable preview showing the exact pre-filled message body.
 * Returns null when the partner has no phone number, per spec.
 */
export function WhatsappContactButton({
  phone,
  message,
  label = "Notify via WhatsApp",
  variant = "outline",
  size = "sm",
  className,
  showPreview = true,
  ...rest
}: WhatsappContactButtonProps) {
  const [open, setOpen] = useState(false);
  if (!normalizeWhatsappPhone(phone)) return null;
  const href = buildWhatsappLink(phone, message);
  if (!href) return null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          asChild
          variant={variant}
          size={size}
          className={cn(
            "gap-2 border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#075E54]",
            className,
          )}
          {...rest}
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" />
            <span>{label}</span>
          </a>
        </Button>
        {showPreview && (
          <Button
            type="button"
            variant="ghost"
            size={size}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            aria-label={open ? "إخفاء معاينة الرسالة" : "معاينة الرسالة"}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            />
            <span className="ms-1">{open ? "إخفاء المعاينة" : "معاينة"}</span>
          </Button>
        )}
      </div>

      {showPreview && open && (
        <div
          dir="ltr"
          className="w-full max-w-md rounded-md border border-[#25D366]/30 bg-[#25D366]/5 p-3 text-xs text-foreground"
        >
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Message preview
          </p>
          <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
            {message}
          </pre>
        </div>
      )}
    </div>
  );
}
