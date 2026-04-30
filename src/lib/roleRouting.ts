import type { MarketplaceRole } from "@/hooks/useAuth";

/**
 * Single source of truth for the post-login landing route per marketplace
 * role. Priority is enforced upstream (super_admin > admin > vendor > client)
 * by `useAuth().marketplaceRole`.
 */
export function homeForRole(
  role: MarketplaceRole | null,
): "/super-admin" | "/admin" | "/vendor" | "/client" | "/login" {
  if (role === "super_admin") return "/super-admin";
  if (role === "admin") return "/admin";
  if (role === "vendor") return "/vendor";
  if (role === "client") return "/client";
  return "/login";
}
