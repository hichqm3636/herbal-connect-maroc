import { Outlet, createRootRoute, HeadContent, Scripts, Link, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { TenantProvider } from "@/hooks/useTenant";
import { CartProvider } from "@/hooks/useCart";
import { CartSheet } from "@/components/CartSheet";
import { ReplaceCartDialog } from "@/components/ReplaceCartDialog";
import { installGlobalErrorHandlers, reportError } from "@/lib/errorLogger";

import appCss from "../styles.css?url";

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    void reportError({
      message: error.message || "Root error boundary",
      stack: error.stack ?? null,
      severity: "error",
      context: { source: "root.errorComponent" },
    });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold">حدث خطأ غير متوقع</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          نأسف لذلك. تم تسجيل المشكلة وسنعمل على إصلاحها.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
          <Link to="/" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Nexora — سوق B2B للجملة في قطاع الصحة" },
      { name: "description", content: "Nexora منصة SaaS وسوق إلكتروني B2B تربط شركات قطاع الصحة بمشتري الجملة: أعشاب، مكملات، مستلزمات طبية وأدوية، مع تكامل توصيل عبر API." },
      { property: "og:title", content: "Nexora — سوق B2B للجملة في قطاع الصحة" },
      { name: "twitter:title", content: "Nexora — سوق B2B للجملة في قطاع الصحة" },
      { property: "og:description", content: "منصة SaaS وسوق B2B لقطاع الصحة. اعرض منتجاتك بالجملة أو اشترِ من موردين موثوقين." },
      { name: "twitter:description", content: "منصة SaaS وسوق B2B لقطاع الصحة. اعرض منتجاتك بالجملة أو اشترِ من موردين موثوقين." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Nexora" },
      { property: "og:locale", content: "ar_AR" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: RootErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <AuthProvider>
          <CartProvider>
            <AuthSyncBridge />
            <Outlet />
            <CartSheet />
            <ReplaceCartDialog />
            <Toaster position="top-center" richColors />
          </CartProvider>
        </AuthProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}

/**
 * Bridges Supabase auth transitions into TanStack Router + Query.
 * On every real session identity change (login / logout / user switch) we:
 *   1. Clear all cached queries so no previous-user data leaks.
 *   2. Invalidate the router so loaders re-run with the new auth context.
 * The very first render is skipped — that's just session hydration.
 */
function AuthSyncBridge() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    const currentId = session?.user?.id ?? null;
    if (lastUserId.current === undefined) {
      lastUserId.current = currentId;
      return;
    }
    if (lastUserId.current === currentId) return;
    lastUserId.current = currentId;
    queryClient.clear();
    router.invalidate();
  }, [session?.user?.id, loading, router, queryClient]);

  return null;
}
