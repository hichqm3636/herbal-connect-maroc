import { Link } from "@tanstack/react-router";
import { ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/clientAnalytics";

interface Props {
  firstName: string;
}

export function ClientHero({ firstName }: Props) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground shadow-elegant sm:p-8"
      dir="rtl"
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
      <div className="relative">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          مرحباً بعودتك
        </div>
        <h1 className="mb-1 text-2xl font-bold leading-tight sm:text-3xl">
          مرحباً {firstName} 👋
        </h1>
        <p className="mb-5 text-sm text-primary-foreground/90 sm:text-base">
          اطلب بسرعة من المنتجات التي تحتاجها — دفعة واحدة.
        </p>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="font-bold shadow-md"
          onClick={() =>
            trackClient("quick_action_click", { action: "hero_shop_now" })
          }
        >
          <Link to="/vendors">
            <ShoppingBag className="h-5 w-5" />
            تسوّق الآن
          </Link>
        </Button>
      </div>
    </section>
  );
}
