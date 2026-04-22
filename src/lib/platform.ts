/**
 * Single source of truth for platform-level branding.
 * Used by AppHeader, AppSidebar and any other chrome that must display
 * Nexora identity when the app runs in platform mode (super_admin on
 * /super-admin, /platform or /admin/* routes).
 */
export const PLATFORM_NAME = "Nexora";
export const PLATFORM_SUBTITLE = "Platform Administration";
export const PLATFORM_SUBTITLE_AR = "وضع المنصة";

/** Fallback workspace name when no tenant company is loaded yet. */
export const TENANT_FALLBACK_NAME = "Workspace";
