import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartProduct {
  id: string;
  name_ar: string;
  price_mad: number;
  image_url: string | null;
  stock: number;
}

export interface CartItem extends CartProduct {
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  totalQty: number;
  total: number;
  addItem: (product: CartProduct, qty?: number) => void;
  updateQty: (id: string, delta: number) => void;
  setQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "herbalife_cart_v1";

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
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + qty } : i,
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

  const setQty = useCallback((id: string, qty: number) => {
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

  const value = useMemo<CartContextValue>(() => {
    const total = items.reduce((s, i) => s + Number(i.price_mad) * i.qty, 0);
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    return { items, total, totalQty, addItem, updateQty, setQty, removeItem, clear };
  }, [items, addItem, updateQty, setQty, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
