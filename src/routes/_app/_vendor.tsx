import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Pathless layout route that gates the entire `/vendor/*` workspace.
 * Only marketplace role `vendor` (or legacy `admin` company owner) may enter.
 * Platform-level `super_admin` and `client` are explicitly denied — admins
 * have their own surface at `/admin/*`.
 */
export const Route = createFileRoute("/_app/_vendor")({
  component: VendorGuard,
});

function VendorGuard() {
  const { isVendor, isSuperAdmin, companyId, loading } = useAuth();
  const navigate = useNavigate();

  // Vendors must be associated with a company. Super admin is NOT allowed
  // here — they go to the platform admin surface.
  useEffect(() => {
    if (loading) return;
    if (isSuperAdmin) {
      navigate({ to: "/super-admin" });
      return;
    }
    if (isVendor && !companyId) {
      // Vendor without a company yet — keep them on settings to finish setup.
      navigate({ to: "/settings" });
    }
  }, [loading, isVendor, isSuperAdmin, companyId, navigate]);

  if (loading) return null;

  if (!isVendor || isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Card className="p-8 max-w-md text-center shadow-soft">
          <ShieldAlert className="h-10 w-10 text-warning-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold">صلاحية غير كافية</h2>
          <p className="text-sm text-muted-foreground mt-2">
            مساحة عمل البائع متاحة لأصحاب المتاجر فقط.
          </p>
        </Card>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Outlet />;
}
