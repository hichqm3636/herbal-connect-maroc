import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { CartSheet } from "@/components/CartSheet";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Leaf, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

// Routes a Platform Owner (super_admin without admin role) should never see.
const DISTRIBUTOR_ONLY_PREFIXES = ["/dashboard", "/shop", "/products", "/quick-order", "/orders", "/invoices", "/loyalty"];
// Routes that require the user to belong to the resolved tenant company.
const TENANT_SCOPED_PREFIXES = ["/dashboard", "/shop", "/products", "/quick-order", "/orders", "/invoices", "/loyalty"];

function AppLayout() {
  const { session, loading, isSuperAdmin, roles, companyId, canAccessDistributorFeatures, isDistributorDisabled } = useAuth();
  const tenant = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const isPlatformOwner = isSuperAdmin && !roles.includes("admin");

  const path = location.pathname;
  const onTenantScopedRoute = TENANT_SCOPED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  // Tenant mismatch: tenant resolved from host doesn't match the user's company.
  // Super admins bypass this check (they can operate cross-tenant).
  const tenantMismatch =
    !loading &&
    !tenant.loading &&
    !isSuperAdmin &&
    onTenantScopedRoute &&
    tenant.kind === "tenant" &&
    !!tenant.company &&
    !!companyId &&
    tenant.company.id !== companyId;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (isPlatformOwner) {
      const onDistributorRoute = DISTRIBUTOR_ONLY_PREFIXES.some(
        (p) => path === p || path.startsWith(p + "/"),
      );
      const onAdminRoute = path === "/admin" || path.startsWith("/admin/");
      const onSettings = path === "/settings";
      if (onDistributorRoute || onAdminRoute || onSettings) {
        navigate({ to: "/super-admin" });
      }
    }
    const onDistributorRoute = DISTRIBUTOR_ONLY_PREFIXES.some(
      (p) => path === p || path.startsWith(p + "/"),
    );
    if (!canAccessDistributorFeatures && onDistributorRoute) {
      navigate({ to: "/settings" });
    }
  }, [session, loading, isPlatformOwner, path, navigate]);

  if (loading || !session || (onTenantScopedRoute && tenant.loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Leaf className="h-7 w-7 text-primary-foreground animate-pulse" />
        </div>
      </div>
    );
  }

  if (tenantMismatch) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-soft p-6"
        dir="rtl"
      >
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-elegant">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <ShieldAlert className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mb-2 text-xl font-bold">لا يمكن الوصول إلى هذه البوابة</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            حسابك لا ينتمي إلى شركة{" "}
            <span className="font-semibold text-foreground">
              {tenant.company?.display_name ?? tenant.company?.name}
            </span>
            . يرجى تسجيل الدخول من البوابة الخاصة بشركتك.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            تسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  const onDistributorRoute = DISTRIBUTOR_ONLY_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );

  if (isDistributorDisabled && onDistributorRoute) {
    return (
      <CartProvider>
        <SidebarProvider>
          <div className="flex min-h-screen w-full overflow-x-hidden bg-background" dir="rtl">
            <AppSidebar />
            <SidebarInset className="flex flex-col min-w-0">
              <AppHeader />
              <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0 overflow-x-hidden">
                <div className="flex items-center justify-center py-16">
                  <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-elegant">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10">
                      <ShieldAlert className="h-7 w-7 text-warning-foreground" />
                    </div>
                    <h1 className="mb-2 text-xl font-bold">حساب الموزع معطل</h1>
                    <p className="text-sm text-muted-foreground">
                      تم تعطيل وصول الموزع إلى المتجر والطلبات. ما يزال بإمكانك تسجيل الدخول واستخدام الأدوار الإدارية المتاحة لحسابك.
                    </p>
                  </div>
                </div>
              </main>
              <CartSheet />
            </SidebarInset>
          </div>
        </SidebarProvider>
      </CartProvider>
    );
  }

  return (
    <CartProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full overflow-x-hidden bg-background" dir="rtl">
          <AppSidebar />
          <SidebarInset className="flex flex-col min-w-0">
            <AppHeader />
            <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0 overflow-x-hidden">
              <Outlet />
            </main>
            <CartSheet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </CartProvider>
  );
}
