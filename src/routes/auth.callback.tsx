import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  head: () => ({
    meta: [{ title: "جاري تسجيل الدخول..." }],
  }),
});

/**
 * Resolve the signed-in user's company slug + role flags so we can route
 * them to the correct portal/area after a magic-link login.
 */
async function resolveUserTenant(userId: string) {
  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isSuper = roles.includes("super_admin");
  const isAdmin = roles.includes("admin");
  const cid = (profile?.company_id as string | undefined | null) ?? null;
  let slug: string | null = null;
  if (cid) {
    const { data: company } = await supabase
      .from("companies")
      .select("slug")
      .eq("id", cid)
      .maybeSingle();
    slug = (company?.slug as string | undefined) ?? null;
  }
  return { slug, isSuper, isAdmin };
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const tenant = useTenant();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const handleSession = async (userId: string) => {
      handled.current = true;
      try {
        const { slug: userSlug, isSuper, isAdmin } = await resolveUserTenant(userId);

        // Tenant-portal guard: a non-super user signing into a tenant portal
        // that doesn't match their company must be rejected.
        if (
          !isSuper &&
          tenant.kind === "tenant" &&
          tenant.slug &&
          userSlug &&
          tenant.slug !== userSlug
        ) {
          await supabase.auth.signOut();
          const portalName =
            tenant.company?.display_name ?? tenant.company?.name ?? tenant.slug;
          toast.error(
            `هذا الحساب لا ينتمي إلى بوابة ${portalName}. يرجى استخدام بوابة شركتك.`,
          );
          navigate({ to: "/login" });
          return;
        }
        if (!isSuper && tenant.kind === "tenant" && !userSlug) {
          await supabase.auth.signOut();
          toast.error("لا توجد شركة مرتبطة بهذا الحساب. تواصل مع الإدارة.");
          navigate({ to: "/login" });
          return;
        }

        toast.success("مرحباً بعودتك");

        // Marketplace routing rules:
        //  - super_admin → /super-admin (force apex host in production)
        //  - admin / vendor → /admin
        //  - client → /vendors
        const host =
          typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";

        if (isSuper) {
          if (host.endsWith(".nexora.app") && host !== "app.nexora.app") {
            window.location.assign("https://app.nexora.app/super-admin");
            return;
          }
          navigate({ to: "/super-admin" });
          return;
        }

        // Cross-host bounce when user lands on the apex/wrong tenant.
        const dest = isAdmin ? "/admin" : "/vendors";
        if (userSlug && tenant.slug !== userSlug) {
          if (host.endsWith(".nexora.app") || host === "nexora.app") {
            window.location.assign(`https://${userSlug}.nexora.app${dest}`);
            return;
          }
          const url = new URL(window.location.origin + dest);
          url.searchParams.set("company", userSlug);
          window.location.assign(url.toString());
          return;
        }

        navigate({ to: dest });
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذر إكمال تسجيل الدخول");
      }
    };

    // Supabase auto-parses the magic-link tokens from the URL hash and emits
    // SIGNED_IN. We listen first, then also check existing session in case the
    // event fired before this component mounted.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user && !handled.current) {
        handleSession(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !handled.current) {
        handleSession(session.user.id);
      } else if (!session) {
        // Give Supabase a brief moment to process the hash; if still no
        // session after that, surface an error.
        setTimeout(() => {
          if (!handled.current) {
            setError("الرابط غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.");
          }
        }, 2500);
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen bg-gradient-soft flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="text-center space-y-3 max-w-sm">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <a
              href="/login"
              className="inline-block text-sm text-primary hover:underline"
            >
              العودة إلى صفحة الدخول
            </a>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              جاري التحقق من رابط الدخول...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
