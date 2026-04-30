import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MarketplaceTopBar } from "@/components/MarketplaceTopBar";
// CartSheet & ReplaceCartDialog are mounted globally in __root.tsx
// so they work on every route (including /store/$slug, /checkout, etc.).
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Leaf, ShieldAlert } from "lucide-react";
import { homeForRole } from "@/lib/roleRouting";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

// Hard prefix isolation per role.
const CLIENT_ONLY_PREFIXES = ["/client", "/orders", "/checkout"];
const VENDOR_ONLY_PREFIXES = ["/vendor"];
const ADMIN_ONLY_PREFIXES = ["/admin"];
const SUPER_ADMIN_ONLY_PREFIXES = ["/super-admin"];

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

export { homeForRole };

function AppLayout() {
  const { session, loading, marketplaceRole, isClient, isVendor, isSuperAdmin, roles, companyId } = useAuth();
  const tenant = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const isPlatformAdmin = roles.includes("admin") || isSuperAdmin;

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

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    const onClientRoute = startsWithAny(path, CLIENT_ONLY_PREFIXES);
    const onVendorRoute = startsWithAny(path, VENDOR_ONLY_PREFIXES);
    const onAdminRoute = startsWithAny(path, ADMIN_ONLY_PREFIXES);
    const onSuperAdminRoute = startsWithAny(path, SUPER_ADMIN_ONLY_PREFIXES);

    if (onClientRoute && !isClient) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
    // Vendor surface is reserved for the vendor role only — admins go to /admin.
    if (onVendorRoute && !isVendor) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
    if (onAdminRoute && !isPlatformAdmin) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
    if (onSuperAdminRoute && !isSuperAdmin) {
      navigate({ to: homeForRole(marketplaceRole) });
      return;
    }
  }, [session, loading, marketplaceRole, isClient, isVendor, isPlatformAdmin, isSuperAdmin, path, navigate]);

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

  // CLIENT surface = Marketplace shape: top-bar only, no sidebar.
  // VENDOR / ADMIN / SUPER_ADMIN surfaces keep the operational sidebar shell.
  if (isClient) {
    return (
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-background" dir="rtl">
        <MarketplaceTopBar />
        <main className="flex-1 min-w-0 overflow-x-hidden">
          {/* Marketplace pages may opt out of the default container by rendering
              their own full-bleed wrapper (e.g. /store/:slug, /checkout). */}
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
            <Outlet />
          </div>
        </main>
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
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
