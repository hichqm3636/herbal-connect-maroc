/**
 * Frontend error logger — small, dependency-free observability layer.
 *
 * Captures:
 *   - window.onerror
 *   - window.onunhandledrejection
 *   - explicit reportError(...) calls (from React errorComponent)
 *
 * Writes to public.client_error_logs via the anon-insertable RLS policy.
 * Best-effort: never throws, never blocks UI, dedupes recent identical errors.
 */
import { supabase } from "@/integrations/supabase/client";

type Severity = "error" | "warning" | "info";

interface ReportInput {
  message: string;
  stack?: string | null;
  severity?: Severity;
  context?: Record<string, unknown>;
}

const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

function shouldSend(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of recent) {
    if (now - t > DEDUPE_WINDOW_MS) recent.delete(k);
  }
  if (recent.has(key)) return false;
  recent.set(key, now);
  return true;
}

export async function reportError(input: ReportInput): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const message = (input.message || "").slice(0, 2000);
    if (!message) return;

    const key = `${message}::${(input.stack || "").slice(0, 200)}`;
    if (!shouldSend(key)) return;

    const { data: sessionRes } = await supabase.auth.getSession();
    const userId = sessionRes.session?.user?.id ?? null;

    await supabase.from("client_error_logs").insert({
      user_id: userId,
      message,
      stack: input.stack?.slice(0, 8000) ?? null,
      url: window.location.href.slice(0, 1000),
      route: window.location.pathname.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 500),
      severity: input.severity ?? "error",
      context: input.context ?? null,
    });
  } catch {
    // never let the logger itself break the app
  }
}

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error;
    void reportError({
      message: err?.message ?? event.message ?? "window.onerror",
      stack: err?.stack ?? null,
      severity: "error",
      context: { source: "window.error", filename: event.filename, lineno: event.lineno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      typeof reason === "string"
        ? reason
        : reason?.message ?? "Unhandled promise rejection";
    void reportError({
      message,
      stack: reason?.stack ?? null,
      severity: "error",
      context: { source: "unhandledrejection" },
    });
  });
}
