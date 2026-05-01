import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketplaceRole } from "@/hooks/useAuth";

interface ClientForbiddenProps {
  role: MarketplaceRole | null;
}

type ActionLink = {
  to: string;
  label: string;
  variant?: "default" | "outline";
};

/**
 * Build the action list shown under the forbidden message.
 * Only links the current role can actually use are returned, so the user
 * never sees a button that would just bounce them again.
 */
function actionsForRole(role: MarketplaceRole | null): ActionLink[] {
  switch (role) {
    case "super_admin":
      return [
        { to: "/super-admin", label: "الانتقال إلى لوحة المشرف العام" },
        { to: "/admin", label: "لوحة الإدارة", variant: "outline" },
      ];
    case "admin":
      return [
        { to: "/admin", label: "الانتقال إلى لوحة الإدارة" },
      ];
    case "vendor":
      return [
        { to: "/vendor", label: "الانتقال إلى لوحة المورد" },
        { to: "/vendors", label: "تصفّح الموردين", variant: "outline" },
      ];
    case "client":
      // Defensive: a client should never see this panel, but if they do,
      // give them the dashboard link.
      return [{ to: "/client", label: "الانتقال إلى لوحتي" }];
    default:
      // No recognized role → only offer the public marketplace.
      return [{ to: "/vendors", label: "تصفّح الموردين" }];
  }
}

/**
 * Inline "no access" panel for /client when a non-client user lands here.
 * Rendered inside the page so the surrounding chrome (sidebar / topbar)
 * stays visible and the user can navigate away easily.
 */
export function ClientForbidden({ role }: ClientForbiddenProps) {
  const actions = actionsForRole(role);

  return (
    <div
      className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border bg-card p-8 text-center shadow-elegant"
      dir="rtl"
      role="alert"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mb-2 text-xl font-bold">لا تملك صلاحية الوصول</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        صفحة <span className="font-semibold text-foreground">لوحة العملاء</span> مخصصة لحسابات
        العملاء فقط. حسابك الحالي ليس حساب عميل، لذا لا يمكنك عرض هذه الصفحة.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {actions.map((a) => (
          <Button key={a.to} asChild variant={a.variant ?? "default"}>
            <Link to={a.to}>{a.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
