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

  // Effective company: explicit active override (sessionStorage) wins, else profile.
  const companyId = activeCompanyId ?? profileCompanyId;

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
    // Non-super users always operate within their own profile company; sync sessionStorage.
    const isSuper = (roleRows ?? []).some((r) => r.role === "super_admin");
    if (!isSuper && cid) {
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

  // Apply company brand color as CSS variable
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (company?.brand_color) {
      document.documentElement.style.setProperty("--company-brand", company.brand_color);
    } else {
      document.documentElement.style.removeProperty("--company-brand");
    }
  }, [company?.brand_color]);

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
    companyId,
    company,
    territoryId,
    pricingTierId,
    pricingTierDiscount,
    loading,
    signOut,
    refreshRoles,
    refreshCompany,
    setActiveCompany,
  }), [session, user, roles, accountType, companyId, company, territoryId, pricingTierId, pricingTierDiscount, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
