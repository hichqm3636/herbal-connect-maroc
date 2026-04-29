import { toast } from "sonner";

/**
 * Detects DB-side LIMIT_EXCEEDED errors raised by check_products_limit /
 * check_users_limit triggers and shows an Arabic toast with a CTA to billing.
 *
 * Returns true when the error was a limit error (already toasted), false otherwise.
 */
export function handleLimitError(
  error: { message?: string | null } | null | undefined,
  resourceLabel: string,
): boolean {
  const msg = error?.message || "";
  const m = msg.match(/LIMIT_EXCEEDED:\s*(\w+)_limit_(\d+)_(\d+)/);
  if (!m) return false;
  const [, , current, max] = m;
  toast.error(`لقد وصلت إلى الحد الأقصى لخطتك (${current}/${max} ${resourceLabel})`, {
    description: "قم بترقية الخطة لإضافة المزيد",
    action: {
      label: "ترقية الخطة",
      onClick: () => {
        window.location.href = "/settings";
      },
    },
  });
  return true;
}
