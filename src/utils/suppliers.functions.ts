import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireUserSession } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions for managing WooCommerce supplier credentials.
 *
 * All operations require the caller to be an admin (or super admin) of the
 * supplier's company. Credentials NEVER leave the server in cleartext —
 * `consumer_secret` is masked when listed.
 */

const PLACEHOLDER = "env://default";

function isPlaceholder(v: string | null | undefined): boolean {
  return !v || v === PLACEHOLDER;
}

function mask(secret: string | null | undefined): string {
  if (isPlaceholder(secret)) return "";
  const s = String(secret);
  if (s.length <= 4) return "••••";
  return "••••••" + s.slice(-4);
}

export interface SupplierListItem {
  id: string;
  company_id: string;
  name: string;
  domain: string;
  consumer_key_masked: string;
  consumer_secret_masked: string;
  domain_uses_env: boolean;
  key_uses_env: boolean;
  secret_uses_env: boolean;
  webhook_secret: string;
  is_active: boolean;
  is_default: boolean;
}

async function assertAdminAndGetCompany(): Promise<{ companyId: string; isSuperAdmin: boolean }> {
  const { user } = await requireUserSession();
  // Load profile + roles
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("company_id").eq("id", user.id).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role, company_id, is_enabled").eq("user_id", user.id),
  ]);
  const isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin" && r.is_enabled);
  const companyId = profile?.company_id ?? null;
  if (!isSuperAdmin) {
    const isAdmin = (roles ?? []).some(
      (r) => r.role === "admin" && r.is_enabled && r.company_id === companyId,
    );
    if (!isAdmin || !companyId) {
      throw new Error("صلاحية غير كافية");
    }
  }
  if (!companyId) throw new Error("الشركة غير محددة");
  return { companyId, isSuperAdmin };
}

/** List suppliers for the current admin's company. Auto-creates default if none. */
export const listSuppliers = createServerFn({ method: "GET" }).handler(
  async (): Promise<SupplierListItem[]> => {
    const { companyId } = await assertAdminAndGetCompany();

    let { data: rows } = await supabaseAdmin
      .from("suppliers" as never)
      .select(
        "id, company_id, name, domain, consumer_key, consumer_secret, webhook_secret, is_active, is_default",
      )
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    // Auto-create a default supplier row if none exists, so the UI always has
    // something to edit.
    if (!rows || rows.length === 0) {
      const { data: created, error } = await supabaseAdmin
        .from("suppliers" as never)
        .insert({
          company_id: companyId,
          name: "Default Supplier",
          domain: PLACEHOLDER,
          consumer_key: PLACEHOLDER,
          consumer_secret: PLACEHOLDER,
          is_active: true,
          is_default: true,
        } as never)
        .select(
          "id, company_id, name, domain, consumer_key, consumer_secret, webhook_secret, is_active, is_default",
        );
      if (error) throw new Error(error.message);
      rows = created ?? [];
    }

    return (rows as Array<{
      id: string;
      company_id: string;
      name: string;
      domain: string;
      consumer_key: string;
      consumer_secret: string;
      webhook_secret: string;
      is_active: boolean;
      is_default: boolean;
    }>).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      name: r.name,
      domain: isPlaceholder(r.domain) ? "" : r.domain,
      consumer_key_masked: isPlaceholder(r.consumer_key) ? "" : mask(r.consumer_key),
      consumer_secret_masked: mask(r.consumer_secret),
      domain_uses_env: isPlaceholder(r.domain),
      key_uses_env: isPlaceholder(r.consumer_key),
      secret_uses_env: isPlaceholder(r.consumer_secret),
      webhook_secret: r.webhook_secret,
      is_active: r.is_active,
      is_default: r.is_default,
    }));
  },
);

interface UpdateSupplierInput {
  id: string;
  name?: string;
  domain?: string;
  consumer_key?: string;
  /** Pass empty string to leave unchanged. */
  consumer_secret?: string;
  is_active?: boolean;
  is_default?: boolean;
}

/** Update credentials / flags for a supplier. Empty secret = keep existing. */
export const updateSupplier = createServerFn({ method: "POST" })
  .inputValidator((input: UpdateSupplierInput) => input)
  .handler(async ({ data }) => {
    const { companyId, isSuperAdmin } = await assertAdminAndGetCompany();

    // Confirm the supplier belongs to this company (super admin can edit any)
    const { data: existing } = await supabaseAdmin
      .from("suppliers" as never)
      .select("id, company_id, consumer_secret, is_default")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("المورّد غير موجود");
    if (!isSuperAdmin && (existing as { company_id: string }).company_id !== companyId) {
      throw new Error("صلاحية غير كافية");
    }

    const update: Record<string, unknown> = {};
    if (typeof data.name === "string" && data.name.trim()) update.name = data.name.trim();
    if (typeof data.domain === "string") {
      const d = data.domain.trim().replace(/\/+$/, "");
      if (!d) throw new Error("الرابط مطلوب");
      if (!d.startsWith("https://")) throw new Error("الرابط يجب أن يبدأ بـ https://");
      update.domain = d;
    }
    if (typeof data.consumer_key === "string") {
      const k = data.consumer_key.trim();
      if (!k) throw new Error("Consumer Key مطلوب");
      update.consumer_key = k;
    }
    if (typeof data.consumer_secret === "string" && data.consumer_secret.trim() !== "") {
      update.consumer_secret = data.consumer_secret.trim();
    }
    if (typeof data.is_active === "boolean") update.is_active = data.is_active;
    if (typeof data.is_default === "boolean") update.is_default = data.is_default;

    if (Object.keys(update).length === 0) return { ok: true, changed: false };

    // If marking this supplier as default, unset other defaults for the company.
    if (update.is_default === true) {
      await supabaseAdmin
        .from("suppliers" as never)
        .update({ is_default: false } as never)
        .eq("company_id", (existing as { company_id: string }).company_id)
        .neq("id", data.id);
    }

    const { error } = await supabaseAdmin
      .from("suppliers" as never)
      .update(update as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, changed: true };
  });

interface TestConnectionInput {
  id?: string;
  /** Or provide ad-hoc credentials to test before saving. */
  domain?: string;
  consumer_key?: string;
  consumer_secret?: string;
}

/** Test WooCommerce credentials by hitting `/wp-json/wc/v3/products?per_page=1`. */
export const testSupplierConnection = createServerFn({ method: "POST" })
  .inputValidator((input: TestConnectionInput) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; status: number; message: string }> => {
    await assertAdminAndGetCompany();

    let domain = data.domain?.trim() ?? "";
    let key = data.consumer_key?.trim() ?? "";
    let secret = data.consumer_secret?.trim() ?? "";

    // If id provided and any field is empty, fall back to stored credentials
    // (resolving env placeholders).
    if (data.id && (!domain || !key || !secret)) {
      const { data: row } = await supabaseAdmin
        .from("suppliers" as never)
        .select("domain, consumer_key, consumer_secret")
        .eq("id", data.id)
        .maybeSingle();
      const r = row as { domain: string; consumer_key: string; consumer_secret: string } | null;
      if (r) {
        if (!domain) domain = isPlaceholder(r.domain) ? (process.env.WOO_BASE_URL ?? "") : r.domain;
        if (!key) key = isPlaceholder(r.consumer_key) ? (process.env.WOOCOMMERCE_CONSUMER_KEY ?? "") : r.consumer_key;
        if (!secret) secret = isPlaceholder(r.consumer_secret) ? (process.env.WOOCOMMERCE_CONSUMER_SECRET ?? "") : r.consumer_secret;
      }
    }

    if (!domain || !key || !secret) {
      return { ok: false, status: 0, message: "Missing credentials" };
    }
    if (!domain.startsWith("https://")) {
      return { ok: false, status: 0, message: "Domain must start with https://" };
    }

    const url = `${domain.replace(/\/+$/, "")}/wp-json/wc/v3/products?per_page=1`;
    const auth = "Basic " + btoa(`${key}:${secret}`);
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.ok) {
        return { ok: true, status: res.status, message: "Connection successful" };
      }
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message: body.slice(0, 200) || `HTTP ${res.status}`,
      };
    } catch (e) {
      return { ok: false, status: 0, message: (e as Error).message };
    }
  });
