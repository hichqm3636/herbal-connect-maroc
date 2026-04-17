import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/_admin")({
  component: AdminGuard,
});

function AdminGuard() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      // stay on page but show message; user can navigate away
    }
  }, [loading, isAdmin, navigate]);

  if (loading) return null;

  if (!isAdmin) {
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

  return <Outlet />;
}
