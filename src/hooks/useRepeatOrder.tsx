import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { parseTiers } from "@/lib/pricing";
import { AUTHZ_MESSAGES_AR } from "@/lib/authzMessages";

interface RepeatResult {
  added: number;
  excluded: number;
}

/**
 * Repeats a previous order by re-adding its items to the current cart.
 * - Inactive products are excluded with a toast warning.
 * - Out-of-stock products are clamped to available stock (excluded if 0).
 * - Prices are recomputed at checkout time from the current product snapshot
 *   and the user's pricing tier (handled in CartSheet).
 */
export function useRepeatOrder() {
  const { user, isDistributorDisabled } = useAuth();
  const { addItem, openCart, clear } = useCart();
  const [loading, setLoading] = useState(false);

  const repeat = useCallback(
    async (orderId: string, opts?: { replaceCart?: boolean }): Promise<RepeatResult | null> => {
      if (!user) {
        toast.error("الرجاء تسجيل الدخول");
        return null;
      }
      if (isDistributorDisabled) {
        toast.error(AUTHZ_MESSAGES_AR.distributor_role_disabled);
        return null;
      }
      setLoading(true);
      try {
        const { data: items, error } = await supabase
          .from("order_items")
          .select(
            "quantity, products(id, name_ar, price_mad, image_url, stock, active, rrp_price, pharmacy_price, map_price, minimum_order, price_tiers)",
          )
          .eq("order_id", orderId);
        if (error) throw error;
        if (!items || items.length === 0) {
          toast.error("الطلب لا يحتوي على منتجات");
          return null;
        }

        if (opts?.replaceCart) clear();

        let added = 0;
        let excluded = 0;
        const excludedNames: string[] = [];

        for (const it of items) {
          const p = it.products as unknown as {
            id: string;
            name_ar: string;
            price_mad: number;
            image_url: string | null;
            stock: number;
            active: boolean;
            rrp_price: number | null;
            pharmacy_price: number | null;
            map_price: number | null;
            minimum_order: number;
            price_tiers: unknown;
          } | null;
          if (!p || !p.active) {
            excluded++;
            if (p?.name_ar) excludedNames.push(p.name_ar);
            continue;
          }
          const qty = Math.min(it.quantity, p.stock);
          if (qty <= 0) {
            excluded++;
            excludedNames.push(p.name_ar);
            continue;
          }
          addItem(
            {
              id: p.id,
              name_ar: p.name_ar,
              price_mad: Number(p.price_mad),
              image_url: p.image_url,
              stock: p.stock,
              rrp_price: p.rrp_price != null ? Number(p.rrp_price) : null,
              pharmacy_price: p.pharmacy_price != null ? Number(p.pharmacy_price) : null,
              map_price: p.map_price != null ? Number(p.map_price) : null,
              minimum_order: p.minimum_order,
              price_tiers: parseTiers(p.price_tiers),
            },
            qty,
          );
          added++;
        }

        if (added === 0) {
          toast.error("لا توجد منتجات متاحة لإعادة الطلب");
          return { added, excluded };
        }

        if (excluded > 0) {
          toast.warning(
            `تمت إضافة ${added} منتج. تم استبعاد ${excluded}${excludedNames.length ? `: ${excludedNames.slice(0, 3).join("، ")}` : ""}`,
          );
        } else {
          toast.success(`تمت إضافة ${added} منتج إلى السلة`);
        }
        openCart();
        return { added, excluded };
      } catch (err) {
        console.error(err);
        toast.error("تعذّر إعادة الطلب");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user, addItem, openCart, clear],
  );

  return { repeat, loading };
}
