import { useEffect, useState } from "react";

/**
 * Lets an admin force the AppHeader into "platform" (Nexora) or "tenant" (company)
 * branding regardless of the current route. Useful for quick visual QA.
 *
 * Stored in localStorage so it survives navigation. Cross-tab/cross-component
 * updates are propagated via a custom "header-preview-change" event.
 */
export type HeaderPreviewMode = "auto" | "platform" | "tenant";

const KEY = "nexora.header-preview-mode";
const EVENT = "header-preview-change";

function read(): HeaderPreviewMode {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(KEY);
  return v === "platform" || v === "tenant" ? v : "auto";
}

export function useHeaderPreview(): [HeaderPreviewMode, (m: HeaderPreviewMode) => void] {
  const [mode, setModeState] = useState<HeaderPreviewMode>(() => read());

  useEffect(() => {
    const sync = () => setModeState(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setMode = (m: HeaderPreviewMode) => {
    if (m === "auto") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, m);
    window.dispatchEvent(new Event(EVENT));
    setModeState(m);
  };

  return [mode, setMode];
}
