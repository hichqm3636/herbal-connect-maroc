import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Leaf, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/hooks/useTenant";

interface Props {
  children: ReactNode;
  /** When true, this section is allowed for the platform (super admin) host. */
  allowPlatform?: boolean;
  /** When true, this section is allowed for the root host (landing). */
  allowRoot?: boolean;
}

/**
 * Wraps tenant-scoped UI. Renders:
 *  - children when the host resolves to a known company (or platform/root if allowed)
 *  - a 404 card for unknown subdomains
 *  - a redirect-to-landing card for the root host when not allowed
 */
export function TenantGate({ children, allowPlatform = false, allowRoot = false }: Props) {
  const { kind, slug, loading } = useTenant();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (kind === "unknown") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-soft p-4"
        dir="rtl"
      >
        <Card className="w-full max-w-md p-8 text-center shadow-elegant">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">الشركة غير موجودة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            لا توجد بوابة موزعين مرتبطة بـ <span className="font-mono">{slug}</span>.
          </p>
          <div className="mt-6">
            <Button asChild className="w-full">
              <a href="https://nexora.app">العودة إلى Nexora</a>
            </Button>
          </div>
          <p className="mt-6 text-[11px] text-muted-foreground">Powered by Nexora</p>
        </Card>
      </div>
    );
  }

  if (kind === "root" && !allowRoot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4" dir="rtl">
        <Card className="w-full max-w-md p-8 text-center shadow-elegant">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Leaf className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">Nexora</h1>
          <p className="mt-1 text-sm text-muted-foreground">Distribution Management Platform</p>
          <p className="mt-4 text-sm text-muted-foreground">
            افتح بوابتك من خلال نطاق شركتك، مثل <span className="font-mono">company.nexora.app</span>.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link to="/">صفحة Nexora الرئيسية</Link>
            </Button>
          </div>
          <p className="mt-6 text-[11px] text-muted-foreground">Powered by Nexora</p>
        </Card>
      </div>
    );
  }

  if (kind === "platform" && !allowPlatform) {
    // A user landed on app.nexora.app but is hitting a tenant-only route.
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4" dir="rtl">
        <Card className="w-full max-w-md p-8 text-center shadow-elegant">
          <h1 className="text-2xl font-extrabold">بوابة Nexora للإدارة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذه البوابة مخصصة لإدارة المنصة. توجه إلى نطاق شركتك للوصول لبوابة الموزعين.
          </p>
          <div className="mt-6">
            <Button asChild className="w-full">
              <Link to="/super-admin">لوحة المدير الأعلى</Link>
            </Button>
          </div>
          <p className="mt-6 text-[11px] text-muted-foreground">Powered by Nexora</p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
