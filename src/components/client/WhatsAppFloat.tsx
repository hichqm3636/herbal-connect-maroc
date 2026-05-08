import { MessageCircle } from "lucide-react";
import { buildWhatsappLink } from "@/utils/whatsapp";
import { trackClient } from "@/lib/clientAnalytics";

const SUPPORT_PHONE = "212600000000"; // TODO: replace with real support number
const DEFAULT_MSG =
  "السلام عليكم، أحتاج مساعدة في طلبي من Nexora.";

interface Props {
  phone?: string;
  message?: string;
}

/**
 * Floating WhatsApp support button — fixed bottom-left for RTL layouts.
 * Hidden on print.
 */
export function WhatsAppFloat({ phone = SUPPORT_PHONE, message = DEFAULT_MSG }: Props) {
  const href = buildWhatsappLink(phone, message);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackClient("quick_action_click", { action: "whatsapp_float" })}
      aria-label="تواصل عبر واتساب"
      className="fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elegant transition-transform hover:scale-105 print:hidden"
    >
      <MessageCircle className="h-7 w-7" fill="currentColor" />
      <span className="sr-only">واتساب</span>
    </a>
  );
}
