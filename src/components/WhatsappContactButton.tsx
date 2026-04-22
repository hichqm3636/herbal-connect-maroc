import { MessageCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { buildWhatsappLink, normalizeWhatsappPhone } from "@/utils/whatsapp";
import { cn } from "@/lib/utils";

interface WhatsappContactButtonProps extends Omit<ButtonProps, "onClick" | "asChild"> {
  phone: string | null | undefined;
  message: string;
  label?: string;
}

/**
 * Renders a "Notify via WhatsApp" button that opens a wa.me link in a new tab.
 * Returns null when the partner has no phone number, per spec.
 */
export function WhatsappContactButton({
  phone,
  message,
  label = "Notify via WhatsApp",
  variant = "outline",
  size = "sm",
  className,
  ...rest
}: WhatsappContactButtonProps) {
  if (!normalizeWhatsappPhone(phone)) return null;
  const href = buildWhatsappLink(phone, message);
  if (!href) return null;

  return (
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
  );
}
