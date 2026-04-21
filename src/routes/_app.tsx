import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { CartSheet } from "@/components/CartSheet";
import { useAuth } from "@/hooks/useAuth";
import { CartProvider } from "@/hooks/useCart";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

// Routes a Platform Owner (super_admin without admin role) should never see.
const DISTRIBUTOR_ONLY_PREFIXES = ["/dashboard", "/products", "/quick-order", "/orders", "/loyalty"];

function AppLayout() {
  const { session, loading, isSuperAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isPlatformOwner = isSuperAdmin && !roles.includes("admin");

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (isPlatformOwner) {
      const path = location.pathname;
      const onDistributorRoute = DISTRIBUTOR_ONLY_PREFIXES.some(
        (p) => path === p || path.startsWith(p + "/"),
      );
      const onAdminRoute = path === "/admin" || path.startsWith("/admin/");
      const onSettings = path === "/settings";
      if (onDistributorRoute || onAdminRoute || onSettings) {
        navigate({ to: "/super-admin" });
      }
    }
  }, [session, loading, isPlatformOwner, location.pathname, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Leaf className="h-7 w-7 text-primary-foreground animate-pulse" />
        </div>
      </div>
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
