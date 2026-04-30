import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

interface Opts {
  productId: string;
  vendorId: string;
  price: number;
  userId?: string | null;
  /** Becomes true once the user adds the item to the cart. Used to skip exit event. */
  addedToCartRef: React.MutableRefObject<boolean>;
}

/**
 * Tracks:
 *  - scroll_depth_25/50/75/100 (each fires once)
 *  - time_on_product (seconds, fired on unmount/exit)
 *  - exit_before_add_to_cart (fired on unmount if addedToCartRef === false)
 */
export function useProductEngagementTracking({
  productId,
  vendorId,
  price,
  userId,
  addedToCartRef,
}: Opts): void {
  const startedAtRef = useRef<number>(Date.now());
  const milestonesRef = useRef<Set<number>>(new Set());
  const sentExitRef = useRef(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    milestonesRef.current = new Set();
    sentExitRef.current = false;

    const base = { product_id: productId, vendor_id: vendorId, price, user_id: userId ?? null };

    const computeDepth = (): number => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return 100;
      return Math.min(100, Math.round(((window.scrollY || 0) / scrollable) * 100));
    };

    const onScroll = () => {
      const d = computeDepth();
      ([25, 50, 75, 100] as const).forEach((m) => {
        if (d >= m && !milestonesRef.current.has(m)) {
          milestonesRef.current.add(m);
          track(`scroll_depth_${m}` as const, base);
        }
      });
    };

    const flushExit = () => {
      if (sentExitRef.current) return;
      sentExitRef.current = true;
      const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      track("time_on_product", { ...base, seconds });
      if (!addedToCartRef.current) {
        track("exit_before_add_to_cart", { ...base, seconds });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushExit();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flushExit);
    document.addEventListener("visibilitychange", onVisibility);

    // Initial check (e.g. short pages already at 100%)
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flushExit);
      document.removeEventListener("visibilitychange", onVisibility);
      flushExit();
    };
  }, [productId, vendorId, price, userId, addedToCartRef]);
}
