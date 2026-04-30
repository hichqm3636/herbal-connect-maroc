import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WishlistButtonProps {
  productId: string;
  companyId: string;
  variant?: "icon" | "full";
  className?: string;
}

export function WishlistButton({
  productId,
  companyId,
  variant = "icon",
  className,
}: WishlistButtonProps) {
  const { user, isClient } = useAuth();
  const [isFav, setIsFav] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsFav(false);
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("wishlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", productId)
        .maybeSingle();
      if (!alive) return;
      setIsFav(!!data);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [user, productId]);

  if (!user || !isClient) return null;

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    if (isFav) {
      const { error } = await supabase
        .from("wishlists")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", productId);
      if (error) toast.error("تعذّر الحذف من المفضلة");
      else {
        setIsFav(false);
        toast.success("تمت الإزالة من المفضلة");
      }
    } else {
      const { error } = await supabase.from("wishlists").insert({
        user_id: user.id,
        product_id: productId,
        company_id: companyId,
      });
      if (error) toast.error("تعذّر الإضافة إلى المفضلة");
      else {
        setIsFav(true);
        toast.success("أُضيف إلى المفضلة");
      }
    }
    setBusy(false);
  };

  if (variant === "full") {
    return (
      <Button
        type="button"
        variant={isFav ? "default" : "outline"}
        size="sm"
        onClick={toggle}
        disabled={busy || !loaded}
        className={cn("gap-1.5", className)}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Heart className={cn("h-3.5 w-3.5", isFav && "fill-current")} />
        )}
        {isFav ? "في المفضلة" : "إضافة للمفضلة"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || !loaded}
      aria-label={isFav ? "إزالة من المفضلة" : "أضف إلى المفضلة"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 backdrop-blur shadow-soft transition-colors",
        isFav ? "text-red-500" : "text-muted-foreground hover:text-red-500",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={cn("h-4 w-4", isFav && "fill-current")} />
      )}
    </button>
  );
}
