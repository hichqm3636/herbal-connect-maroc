import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/_admin")({
  component: AdminGuard,
});

function AdminGuard() {
  const { isVendor, isSuperAdmin, companyId, loading } = useAuth();
  const navigate = useNavigate();

  // If super admin hasn't picked a company yet, send them to the selector.
  useEffect(() => {
    if (loading) return;
    if (isSuperAdmin && !companyId) {
      navigate({ to: "/super-admin/companies" });
    }
  }, [loading, isSuperAdmin, companyId, navigate]);

  if (loading) return null;

  if (!isVendor && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="p-8 max-w-md text-center shadow-soft">
          <ShieldAlert className="h-10 w-10 text-warning-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold">صلاحية غير كافية</h2>
          <p className="text-sm text-muted-foreground mt-2">
            هذه الصفحة مخصصة للمسؤولين فقط. تواصل مع الإدارة لمنحك الصلاحية.
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
