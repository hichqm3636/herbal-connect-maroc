import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Leaf className="h-7 w-7 text-primary-foreground animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return <Navigate to={session ? "/dashboard" : "/login"} />;
}
