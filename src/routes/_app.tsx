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

// Routes that only the `client` marketplace role may access.
const CLIENT_ONLY_PREFIXES = ["/orders"];
// Routes that only `vendor` / `admin` may access.
const VENDOR_ONLY_PREFIXES = ["/admin"];
// Routes that only `super_admin` may access.
const SUPER_ADMIN_ONLY_PREFIXES = ["/super-admin"];

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

/** Default landing route per marketplace role. */
function homeForRole(role: "client" | "vendor" | "admin" | "super_admin" | null): string {
  if (role === "super_admin") return "/super-admin";
  if (role === "admin" || role === "vendor") return "/admin";
  if (role === "client") return "/vendors";
  return "/login";
}

function AppLayout() {
  const { session, loading, marketplaceRole, isClient, isVendor, isSuperAdmin, companyId } = useAuth();
  const tenant = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  // Tenant mismatch only matters for client orders / vendor admin pages.
  const onTenantScopedRoute =
    startsWithAny(path, CLIENT_ONLY_PREFIXES) || startsWithAny(path, VENDOR_ONLY_PREFIXES);

  const tenantMismatch =
    !loading &&
    !tenant.loading &&
    !isSuperAdmin &&
    onTenantScopedRoute &&
    tenant.kind === "tenant" &&
    !!tenant.company &&
    !!companyId &&
    tenant.company.id !== companyId;

  // Role-based redirects: keep each role inside its own area.
  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    const onClientRoute = startsWithAny(path, CLIENT_ONLY_PREFIXES);
    const onVendorRoute = startsWithAny(path, VENDOR_ONLY_PREFIXES);
    const onSuperAdminRoute = startsWithAny(path, SUPER_ADMIN_ONLY_PREFIXES);

    if (onClientRoute && !isClient) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
    if (onVendorRoute && !isVendor && !isSuperAdmin) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
    if (onSuperAdminRoute && !isSuperAdmin) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
  }, [session, loading, marketplaceRole, isClient, isVendor, isSuperAdmin, path, navigate]);

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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-background" dir="rtl">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0 overflow-x-hidden">
            <Outlet />
          </main>
          {/* Cart drawer is itself gated to client role inside the component. */}
          <CartSheet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
