/**
 * Client-side flag indicating the current browser session has passed the
 * super-admin secret-code gate. This is NOT a security boundary on its own —
 * RLS + the `super_admin` role enforce data access. This flag only controls
 * whether the UI lets the user reach `/super-admin/*` routes.
 */
const KEY = "super_admin_gate_ok";

export function markSuperAdminGatePassed() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSuperAdminGate() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasSuperAdminGatePassed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
