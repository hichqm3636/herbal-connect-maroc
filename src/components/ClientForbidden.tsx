import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketplaceRole } from "@/hooks/useAuth";
import { homeForRole } from "@/lib/roleRouting";

interface ClientForbiddenProps {
  role: MarketplaceRole | null;
}

/**
 * Inline "no access" panel for /client when a non-client user lands here.
 * Rendered inside the page so the surrounding chrome (sidebar / topbar)
 * stays visible and the user can navigate away easily.
 */
export function ClientForbidden({ role }: ClientForbiddenProps) {
  const homePath = homeForRole(role);
  const roleLabel =
    role === "vendor"
      ? "لوحة المورد"
      : role === "admin"
        ? "لوحة الإدارة"
        : role === "super_admin"
          ? "لوحة المشرف العام"
          : "لوحتك";

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
        <Button asChild>
          <Link to={homePath}>الانتقال إلى {roleLabel}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/vendors">تصفّح الموردين</Link>
        </Button>
      </div>
    </div>
  );
}
