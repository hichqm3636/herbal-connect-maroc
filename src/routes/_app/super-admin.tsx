import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/super-admin")({
  component: SuperAdminGuard,
});

function SuperAdminGuard() {
  const { isSuperAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      // show denial; user can navigate
    }
  }, [loading, isSuperAdmin, navigate]);

  if (loading) return null;

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Card className="p-8 max-w-md text-center shadow-soft">
          <ShieldAlert className="h-10 w-10 text-warning-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold">صلاحية غير كافية</h2>
          <p className="text-sm text-muted-foreground mt-2">
            هذه الصفحة مخصصة للمدير الأعلى للمنصة فقط.
          </p>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
