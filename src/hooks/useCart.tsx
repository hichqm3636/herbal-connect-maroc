import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PriceTier } from "@/lib/pricing";

export interface CartProduct {
  id: string;
  name_ar: string;
  /** Legacy fallback price; used when wholesale fields are absent. */
  price_mad: number;
  image_url: string | null;
  /** null = available but quantity unknown (e.g. WooCommerce instock w/o qty). */
  stock: number | null;
  /** REQUIRED for V3 single-vendor cart enforcement. */
  vendor_id: string;
  vendor_slug?: string;
  vendor_name?: string;
  // Wholesale fields (optional for backward compat)
  rrp_price?: number | null;
  pharmacy_price?: number | null;
  map_price?: number | null;
  minimum_order?: number;
  pack_size?: number;
  price_tiers?: PriceTier[];
}

export interface CartItem extends CartProduct {
  qty: number;
  /** Computed by the cart consumer based on partner_type + qty before checkout. */
  unit_price?: number;
}

/**
 * Result of trying to add an item:
 *  - "added"    — item was added (or quantity bumped)
 *  - "conflict" — different vendor; caller MUST resolve via the AlertDialog
 *                 then call confirmReplace() to clear+add.
 */
export type AddResult =
  | { kind: "added" }
  | {
      kind: "conflict";
      currentVendorName: string;
      incomingVendorName: string;
    };

interface CartContextValue {
  items: CartItem[];
  totalQty: number;
  /** Sum based on legacy price_mad for backwards compatibility (header badge etc.). */
  total: number;
  /** vendor_id of the items currently in the cart (single-vendor invariant). */
  vendorId: string | null;
  vendorName: string | null;
  /** Try to add. Returns "conflict" if another vendor's items are present. */
  tryAdd: (product: CartProduct, qty?: number) => AddResult;
  /** After a "conflict", call this to clear the cart and add the pending item. */
  confirmReplace: () => void;
  /** Cancel a pending replace conflict. */
  cancelReplace: () => void;
  /** The pending item awaiting replace confirmation (drives the AlertDialog). */
  pending: { product: CartProduct; qty: number } | null;
  /** Direct add WITHOUT vendor check. Use only when you know the vendor matches. */
  addItem: (product: CartProduct, qty?: number) => void;
  updateQty: (id: string, delta: number) => void;
  setQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "nexora_cart_v3";
const LEGACY_KEY = "herbalife_cart_v2";

function loadInitial(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop legacy items that don't carry a vendor_id — they're unsafe under V3
    // single-vendor enforcement.
    return parsed.filter(
      (i): i is CartItem =>
        i &&
        typeof i.id === "string" &&
        typeof i.name_ar === "string" &&
        typeof i.qty === "number" &&
        i.qty > 0 &&
        typeof i.vendor_id === "string",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadInitial());
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState<{ product: CartProduct; qty: number } | null>(
    null,
  );
  const writeRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      // Drop legacy key once we own the state.
      if (writeRef.current === false) {
        window.localStorage.removeItem(LEGACY_KEY);
        writeRef.current = true;
      }
    } catch {
      // storage full or disabled — ignore
    }
  }, [items]);

  // Sync across tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setItems(loadInitial());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const vendorId = items[0]?.vendor_id ?? null;
  const vendorName = items[0]?.vendor_name ?? items[0]?.vendor_slug ?? null;

  const addItem = useCallback((product: CartProduct, qty = 1) => {
    if (qty <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, ...product, qty: i.qty + qty } : i,
        );
      }
      return [...prev, { ...product, qty }];
    });
  }, []);

  const tryAdd = useCallback(
    (product: CartProduct, qty = 1): AddResult => {
      if (qty <= 0) return { kind: "added" };
      const currentVendor = items[0]?.vendor_id ?? null;
      if (currentVendor && currentVendor !== product.vendor_id) {
        // Different vendor — surface the conflict to the caller.
        setPending({ product, qty });
        return {
          kind: "conflict",
          currentVendorName:
            items[0]?.vendor_name ?? items[0]?.vendor_slug ?? "بائع آخر",
          incomingVendorName: product.vendor_name ?? product.vendor_slug ?? "البائع",
        };
      }
      addItem(product, qty);
      return { kind: "added" };
    },
    [items, addItem],
  );

  const confirmReplace = useCallback(() => {
    if (!pending) return;
    setItems([{ ...pending.product, qty: pending.qty }]);
    setPending(null);
  }, [pending]);

  const cancelReplace = useCallback(() => setPending(null), []);

  const updateQty = useCallback((id: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0),
    );
  }, []);

  const setItemQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, qty) } : i))
        .filter((i) => i.qty > 0),
    );
  }, []);

  const removeItem = useCallback(
    (id: string) => setItems((prev) => prev.filter((i) => i.id !== id)),
    [],
  );

  const clear = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    const total = items.reduce((s, i) => s + Number(i.price_mad) * i.qty, 0);
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    return {
      items,
      total,
      totalQty,
      vendorId,
      vendorName,
      tryAdd,
      confirmReplace,
      cancelReplace,
      pending,
      addItem,
      updateQty,
      setQty: setItemQty,
      removeItem,
      clear,
      isOpen,
      openCart,
      closeCart,
      setOpen,
    };
  }, [
    items,
    vendorId,
    vendorName,
    tryAdd,
    confirmReplace,
    cancelReplace,
    pending,
    addItem,
    updateQty,
    setItemQty,
    removeItem,
    clear,
    isOpen,
    openCart,
    closeCart,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
