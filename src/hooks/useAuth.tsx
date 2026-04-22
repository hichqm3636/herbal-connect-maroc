import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerType } from "@/lib/pricing";

export type AppRole =
  | "admin"
  | "super_admin"
  | "buyer"
  | "seller"
  | "sales_agent"
  | "distributor"; // legacy — kept so existing rows still parse

export interface Company {
  id: string;
  name: string;
  display_name: string;
  logo_url: string | null;
  brand_color: string;
}

export type AppMode = "platform" | "tenant";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  isSalesAgent: boolean;
  /** Business classification of the account (pharmacy, distributor, etc). */
  accountType: PartnerType;
  /** @deprecated use `accountType`. Kept for back-compat. */
  partnerType: PartnerType;
  /** Current UI mode. In `platform` mode no tenant context is loaded. */
  mode: AppMode;
  companyId: string | null;
  company: Company | null;
  territoryId: string | null;
  pricingTierId: string | null;
  pricingTierDiscount: number;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshCompany: () => Promise<void>;
  setActiveCompany: (companyId: string | null) => void;
}

/**
 * Routes that are part of the Nexora platform admin surface. While a
 * super_admin is on one of these paths we never load tenant branding —
 * the UI must show Nexora / Platform Administration only.
 */
function pathIsPlatform(path: string): boolean {
  return (
    path === "/super-admin" ||
    path.startsWith("/super-admin/") ||
    path === "/platform" ||
    path.startsWith("/platform/") ||
    path === "/admin" ||
    path.startsWith("/admin/")
  );
}

function readPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

const ACTIVE_COMPANY_KEY = "active_company_id";

function readActiveCompany(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACTIVE_COMPANY_KEY);
  } catch {
    return null;
  }
}

function writeActiveCompany(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.sessionStorage.setItem(ACTIVE_COMPANY_KEY, id);
    else window.sessionStorage.removeItem(ACTIVE_COMPANY_KEY);
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [accountType, setAccountType] = useState<PartnerType>("distributor");
  const [profileCompanyId, setProfileCompanyId] = useState<string | null>(null);
  const [territoryId, setTerritoryId] = useState<string | null>(null);
  const [pricingTierId, setPricingTierId] = useState<string | null>(null);
  const [pricingTierDiscount, setPricingTierDiscount] = useState<number>(0);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(() =>
    readActiveCompany(),
  );
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [pathname, setPathname] = useState<string>(() => readPath());

  const isSuperAdmin = roles.includes("super_admin");

  // Track route so we can flip into platform mode for super_admins on
  // /platform, /super-admin, or /admin/* without a full reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setPathname(readPath());
    window.addEventListener("popstate", sync);
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      sync();
      return r;
    };
    window.history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      sync();
      return r;
    };
    return () => {
      window.removeEventListener("popstate", sync);
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, []);

  // Platform mode: a super_admin on a platform route. In this mode we drop
  // all tenant context (no company, no companyId) so the previously selected
  // tenant cannot bleed into Nexora's admin UI.
  const mode: AppMode = isSuperAdmin && pathIsPlatform(pathname) ? "platform" : "tenant";

  // Effective company. Forced to null in platform mode.
  const companyId = mode === "platform" ? null : (activeCompanyId ?? profileCompanyId);

  const setActiveCompany = (id: string | null) => {
    writeActiveCompany(id);
    setActiveCompanyIdState(id);
  };

  const loadCompany = async (cid: string | null) => {
    if (!cid) {
      setCompany(null);
      return;
    }
    const { data } = await supabase
      .from("companies")
      .select("id, name, display_name, logo_url, brand_color")
      .eq("id", cid)
      .maybeSingle();
    setCompany((data as Company | null) ?? null);
  };

  const loadProfile = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      setAccountType("distributor");
      setProfileCompanyId(null);
      setTerritoryId(null);
      setPricingTierId(null);
      setPricingTierDiscount(0);
      setCompany(null);
      return;
    }
    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("profiles")
        .select("account_type, company_id, territory_id")
        .eq("id", uid)
        .maybeSingle(),
    ]);
    setRoles((roleRows ?? []).map((r) => r.role as AppRole));
    setAccountType((profile?.account_type as PartnerType | undefined) ?? "distributor");
    const cid = (profile?.company_id as string | null | undefined) ?? null;
    setProfileCompanyId(cid);
    setTerritoryId((profile?.territory_id as string | null | undefined) ?? null);

    // Fetch this distributor's pricing assignment from the new table.
    let tierId: string | null = null;
    let discount = 0;
    if (cid) {
      const { data: cdp } = await supabase
        .from("company_distributor_pricing")
        .select("pricing_tier_id, custom_discount_percent, pricing_tiers(base_discount_percent)")
        .eq("company_id", cid)
        .eq("distributor_id", uid)
        .maybeSingle();
      if (cdp) {
        tierId = (cdp as { pricing_tier_id: string }).pricing_tier_id;
        const custom = (cdp as { custom_discount_percent: number | null }).custom_discount_percent;
        const base = (cdp as unknown as { pricing_tiers?: { base_discount_percent: number } | null })
          .pricing_tiers?.base_discount_percent;
        discount = custom != null ? Number(custom) : base != null ? Number(base) : 0;
      }
    }
    setPricingTierId(tierId);
    setPricingTierDiscount(discount);
    // Tenant context rules:
    //  - Super admins: ALWAYS start with no active tenant. They must explicitly
    //    pick a company from the selector. This prevents the previously
    //    selected tenant from bleeding into Nexora's admin UI.
    //  - Everyone else: pin sessionStorage to their own profile company.
    const isSuper = (roleRows ?? []).some((r) => r.role === "super_admin");
    if (isSuper) {
      writeActiveCompany(null);
      setActiveCompanyIdState(null);
    } else if (cid) {
      writeActiveCompany(cid);
      setActiveCompanyIdState(cid);
    }
  };

  // Reload company record whenever effective companyId changes.
  useEffect(() => {
    loadCompany(companyId);
  }, [companyId]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user.id), 0);
      } else {
        setRoles([]);
        setAccountType("distributor");
        setProfileCompanyId(null);
        setTerritoryId(null);
        setCompany(null);
        writeActiveCompany(null);
        setActiveCompanyIdState(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        loadProfile(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Apply company brand color as CSS variable. In platform mode we strip
  // any tenant brand entirely so Nexora's chrome owns the look.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const brand = mode === "platform" ? null : company?.brand_color ?? null;
    if (brand) {
      document.documentElement.style.setProperty("--company-brand", brand);
    } else {
      document.documentElement.style.removeProperty("--company-brand");
    }
  }, [company?.brand_color, mode]);

  const signOut = async () => {
    writeActiveCompany(null);
    setActiveCompanyIdState(null);
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    await loadProfile(user?.id);
  };

  const refreshCompany = async () => {
    await loadCompany(companyId);
  };

  // In platform mode, expose no tenant company at all.
  const exposedCompany = mode === "platform" ? null : company;

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    roles,
    isAdmin: roles.includes("admin") || roles.includes("super_admin"),
    isSuperAdmin: roles.includes("super_admin"),
    isBuyer: roles.includes("buyer"),
    isSeller: roles.includes("seller") || roles.includes("distributor"),
    isSalesAgent: roles.includes("sales_agent"),
    accountType,
    partnerType: accountType,
    mode,
    companyId,
    company: exposedCompany,
    territoryId,
    pricingTierId,
    pricingTierDiscount,
    loading,
    signOut,
    refreshRoles,
    refreshCompany,
    setActiveCompany,
  }), [session, user, roles, accountType, mode, companyId, exposedCompany, territoryId, pricingTierId, pricingTierDiscount, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
