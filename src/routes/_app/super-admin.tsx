import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { hasSuperAdminGatePassed, clearSuperAdminGate } from "@/lib/superAdminGate";

export const Route = createFileRoute("/_app/super-admin")({
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const { isSuperAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Not a super_admin → sign out and bounce to /control
    if (!isSuperAdmin) {
      clearSuperAdminGate();
      signOut().finally(() => navigate({ to: "/control" }));
      return;
    }

    // Super_admin but didn't pass the secret-code gate this session
    if (!hasSuperAdminGatePassed()) {
      navigate({ to: "/control" });
    }
  }, [loading, isSuperAdmin, navigate, signOut]);

  if (loading || !isSuperAdmin || !hasSuperAdminGatePassed()) return null;
  return <Outlet />;
}
