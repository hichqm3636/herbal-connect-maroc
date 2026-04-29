import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { hasSuperAdminGatePassed, clearSuperAdminGate } from "@/lib/superAdminGate";

export const Route = createFileRoute("/_app/super-admin")({
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const { isSuperAdmin, loading, session, roles } = useAuth();
  const navigate = useNavigate();

  // Wait until we have a session AND the roles list has been hydrated
  // before making any access decision. Without this, there's a brief
  // window right after sign-in where loading=false but roles=[] which
  // would wrongly trigger a sign-out and bounce back to /control.
  const rolesReady = !!session && roles.length > 0;

  useEffect(() => {
    if (loading) return;

    if (!session) {
      clearSuperAdminGate();
      navigate({ to: "/control" });
      return;
    }

    // Session exists but roles haven't loaded yet — wait, don't sign out.
    if (!rolesReady) return;

    if (!isSuperAdmin) {
      clearSuperAdminGate();
      navigate({ to: "/control" });
      return;
    }

    if (!hasSuperAdminGatePassed()) {
      navigate({ to: "/control" });
    }
  }, [loading, session, rolesReady, isSuperAdmin, navigate]);

  if (loading || !rolesReady || !isSuperAdmin || !hasSuperAdminGatePassed()) return null;
  return <Outlet />;
}
