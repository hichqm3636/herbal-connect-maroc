import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { PartnerType } from "@/lib/pricing";

type AppRole = "admin" | "distributor" | "super_admin";

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
  partnerType: PartnerType;
  companyId: string | null;
  company: Company | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  refreshCompany: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [partnerType, setPartnerType] = useState<PartnerType>("distributor");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

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
      setPartnerType("distributor");
      setCompanyId(null);
      setCompany(null);
      return;
    }
    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("partner_type, company_id").eq("id", uid).maybeSingle(),
    ]);
    setRoles((roleRows ?? []).map((r) => r.role as AppRole));
    setPartnerType((profile?.partner_type as PartnerType | undefined) ?? "distributor");
    const cid = (profile?.company_id as string | null | undefined) ?? null;
    setCompanyId(cid);
    await loadCompany(cid);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user.id), 0);
      } else {
        setRoles([]);
        setPartnerType("distributor");
        setCompanyId(null);
        setCompany(null);
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
    partnerType,
    companyId,
    company,
    loading,
    signOut,
    refreshRoles,
    refreshCompany,
  }), [session, user, roles, partnerType, companyId, company, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
