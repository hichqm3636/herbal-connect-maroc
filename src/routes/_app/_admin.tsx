import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Pathless layout route that gates the entire `/admin/*` platform admin
 * surface. Reserved for the explicit `admin` role (platform moderator) and
 * for `super_admin`. Vendors (workspace owners) live at `/vendor/*` instead.
 */
export const Route = createFileRoute("/_app/_admin")({
  component: AdminGuard,
});

function AdminGuard() {
  const { marketplaceRole, isSuperAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const isPlatformAdmin = marketplaceRole === "admin" || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!isPlatformAdmin) navigate({ to: "/" });
  }, [loading, isPlatformAdmin, navigate]);

  if (loading) return null;

  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Card className="p-8 max-w-md text-center shadow-soft">
          <ShieldAlert className="h-10 w-10 text-warning-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold">صلاحية غير كافية</h2>
          <p className="text-sm text-muted-foreground mt-2">
            هذه الصفحة مخصصة لمسؤولي المنصة فقط.
          </p>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
