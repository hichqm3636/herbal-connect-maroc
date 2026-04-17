import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/AppSidebar";
import { CartButton, CartSheet } from "@/components/CartSheet";
import { useAuth } from "@/hooks/useAuth";
import { CartProvider } from "@/hooks/useCart";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [session, loading, navigate]);

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
        <div className="flex min-h-screen w-full bg-background" dir="rtl">
          <AppSidebar />
          <SidebarInset className="flex flex-col">
            <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 backdrop-blur px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-5" />
              <span className="text-sm font-medium text-muted-foreground">بوابة شركاء هيرباليفي</span>
            </header>
            <main className="flex-1 p-4 md:p-6 lg:p-8">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </CartProvider>
  );
}
