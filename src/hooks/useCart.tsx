import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PriceTier } from "@/lib/pricing";

export interface CartProduct {
  id: string;
  name_ar: string;
  /** Legacy fallback price; used when wholesale fields are absent. */
  price_mad: number;
  image_url: string | null;
  stock: number;
  // Wholesale fields (optional for backward compat)
  rrp_price?: number | null;
  pharmacy_price?: number | null;
  map_price?: number | null;
  minimum_order?: number;
  price_tiers?: PriceTier[];
}

export interface CartItem extends CartProduct {
  qty: number;
  /** Computed by the cart consumer based on partner_type + qty before checkout. */
  unit_price?: number;
}

interface CartContextValue {
  items: CartItem[];
  totalQty: number;
  /** Sum based on legacy price_mad for backwards compatibility (header badge etc.). */
  total: number;
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
const STORAGE_KEY = "herbalife_cart_v2";

function loadInitial(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        i &&
        typeof i.id === "string" &&
        typeof i.name_ar === "string" &&
        typeof i.qty === "number" &&
        i.qty > 0,
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadInitial());
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

  const addItem = useCallback((product: CartProduct, qty = 1) => {
    if (qty <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        // Refresh wholesale snapshot in case product was edited between adds
        return prev.map((i) =>
          i.id === product.id ? { ...i, ...product, qty: i.qty + qty } : i,
        );
      }
      return [...prev, { ...product, qty }];
    });
  }, []);

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
  }, [items, addItem, updateQty, setItemQty, removeItem, clear, isOpen, openCart, closeCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
