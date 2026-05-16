import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { resolveTenant } from "@/lib/tenant.functions";
import type { Company } from "@/hooks/useAuth";

/**
 * Multi-tenant resolution for Nexora.
 *
 * Production: subdomain → company slug
 *   - app.nexora.app          → reserved (Super Admin / platform)
 *   - <slug>.nexora.app       → tenant portal
 *   - nexora.app / www        → landing page (no tenant)
 *
 * Dev / Lovable preview: ?company=<slug> in the URL.
 *   - No query param          → landing page (no tenant)
 *   - ?company=app            → reserved (Super Admin / platform)
 *   - ?company=<slug>         → tenant portal
 */

const ROOT_HOSTS = new Set(["nexora.app", "www.nexora.app"]);
const RESERVED_SLUGS = new Set(["app", "www", "api", "admin"]);

export type TenantKind = "root" | "platform" | "tenant" | "unknown";

export interface TenantState {
  kind: TenantKind;
  slug: string | null;
  company: Company | null;
  loading: boolean;
}

function detectSlug(): { slug: string | null; isPlatform: boolean; isRoot: boolean } {
  if (typeof window === "undefined") {
    return { slug: null, isPlatform: false, isRoot: true };
  }

  // Dev override via ?company= (works in Lovable preview, localhost, anywhere).
  const params = new URLSearchParams(window.location.search);
  const override = params.get("company")?.trim().toLowerCase() || null;
  if (override) {
    if (override === "app") return { slug: null, isPlatform: true, isRoot: false };
    return { slug: override, isPlatform: false, isRoot: false };
  }

  const host = window.location.hostname.toLowerCase();

  // Root domain → landing.
  if (ROOT_HOSTS.has(host)) {
    return { slug: null, isPlatform: false, isRoot: true };
  }

  // Only resolve subdomains under nexora.app in production.
  if (host.endsWith(".nexora.app")) {
    const sub = host.slice(0, -".nexora.app".length);
    if (sub === "app") return { slug: null, isPlatform: true, isRoot: false };
    if (RESERVED_SLUGS.has(sub)) return { slug: null, isPlatform: false, isRoot: true };
    return { slug: sub, isPlatform: false, isRoot: false };
  }

  // Lovable preview / localhost / any other host → behave as root unless ?company=.
  return { slug: null, isPlatform: false, isRoot: true };
}

const TenantContext = createContext<TenantState | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TenantState>(() => {
    const { slug, isPlatform, isRoot } = detectSlug();
    return {
      kind: isRoot ? "root" : isPlatform ? "platform" : slug ? "tenant" : "root",
      slug,
      company: null,
      loading: !!slug, // only need DB lookup if a tenant slug is present
    };
  });

  useEffect(() => {
    let cancelled = false;
    const { slug, isPlatform, isRoot } = detectSlug();

    if (isRoot) {
      setState({ kind: "root", slug: null, company: null, loading: false });
      return;
    }
    if (isPlatform) {
      setState({ kind: "platform", slug: null, company: null, loading: false });
      return;
    }
    if (!slug) {
      setState({ kind: "root", slug: null, company: null, loading: false });
      return;
    }

    setState((s) => ({ ...s, loading: true, slug, kind: "tenant" }));
    resolveTenant({ data: { slug } })
      .then((res) => {
        if (cancelled) return;
        if (!res.found) {
          setState({ kind: "unknown", slug, company: null, loading: false });
          return;
        }
        setState({ kind: "tenant", slug, company: res.company, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "unknown", slug, company: null, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply brand color globally for the tenant.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (state.company?.brand_color) {
      document.documentElement.style.setProperty("--company-brand", state.company.brand_color);
    }
  }, [state.company?.brand_color]);

  return <TenantContext.Provider value={state}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
