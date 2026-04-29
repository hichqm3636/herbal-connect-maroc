import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/super-admin")({
  component: SuperAdminLayout,
});

function SuperAdminLayout() {
  const { isSuperAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/" });
  }, [loading, isSuperAdmin, navigate]);
  if (loading || !isSuperAdmin) return null;
  return <Outlet />;
}
