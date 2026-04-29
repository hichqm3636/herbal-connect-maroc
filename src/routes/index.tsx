import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Leaf, Building2, ArrowLeft, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth, type MarketplaceRole } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";

export const Route = createFileRoute("/")({
  component: Index,
});

function homeForRole(role: MarketplaceRole | null): "/super-admin" | "/admin" | "/vendor" | "/vendors" | "/login" {
  if (role === "super_admin") return "/super-admin";
  if (role === "admin") return "/admin";
  if (role === "vendor") return "/vendor";
  if (role === "client") return "/vendors";
  return "/login";
}

function Index() {
  const { session, loading, marketplaceRole } = useAuth();
  const tenant = useTenant();

  if (loading || tenant.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
          <Leaf className="h-7 w-7 text-primary-foreground animate-pulse" />
        </div>
      </div>
    );
  }

  // Unknown subdomain → 404 with link back to nexora.app
  if (tenant.kind === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4" dir="rtl">
        <Card className="w-full max-w-md p-8 text-center shadow-elegant">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <Building2 className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">404 — الشركة غير موجودة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            البوابة <span className="font-mono">{tenant.slug}.nexora.app</span> غير مسجلة على Nexora.
          </p>
          <Button asChild className="mt-6 w-full">
            <a href="https://nexora.app">
              <ArrowLeft className="h-4 w-4" />
              العودة إلى Nexora
            </a>
          </Button>
          <p className="mt-6 text-[11px] text-muted-foreground">Powered by Nexora</p>
        </Card>
      </div>
    );
  }

  // Root domain → Nexora landing placeholder
  if (tenant.kind === "root") {
    return <NexoraLanding isAuthenticated={!!session} />;
  }

  // Platform host (app.nexora.app) → Super Admin if signed in, else login.
  if (tenant.kind === "platform") {
    return <Navigate to={session ? homeForRole(marketplaceRole) : "/login"} />;
  }

  // Tenant host → role-aware landing.
  return <Navigate to={session ? homeForRole(marketplaceRole) : "/login"} />;
}

function NexoraLanding({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gradient-soft p-6"
      dir="rtl"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Leaf className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight">Nexora</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Distribution Management Platform
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            منصة Nexora متعددة المستأجرين لإدارة الموزعين والطلبات والفوترة. كل شركة تحصل على
            بوابتها الخاصة على نطاق فرعي مثل <span className="font-mono">company.nexora.app</span>.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/signup">
                <Rocket className="h-4 w-4" />
                أنشئ بوابتك الآن
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/vendors">تصفّح البائعين</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to={isAuthenticated ? "/super-admin" : "/login"}>بوابة الإدارة</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            مجاناً للبدء — بوابتك جاهزة في أقل من 30 ثانية
          </p>
        </div>
      </div>
      <footer className="text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} Nexora — Distribution Management Platform
      </footer>
    </div>
  );
}
