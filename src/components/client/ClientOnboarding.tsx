import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Store,
  UserPlus,
  HelpCircle,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackClient } from "@/lib/clientAnalytics";

const STEPS = [
  {
    n: 1,
    icon: Search,
    title: "تصفّح الموردين",
    body: "اكتشف الموردين المعتمدين على المنصة وتصفّح كتالوجاتهم.",
  },
  {
    n: 2,
    icon: ShoppingCart,
    title: "أضف للسلة واطلب",
    body: "اختر منتجاتك من مورد واحد لكل طلب وأكمل الدفع بسهولة.",
  },
  {
    n: 3,
    icon: Truck,
    title: "تابع طلبك",
    body: "تتبّع حالة الطلب من التأكيد حتى التسليم في لوحتك.",
  },
] as const;

const REQUEST_VENDOR_HREF =
  "https://wa.me/212600000000?text=" +
  encodeURIComponent("مرحباً، أرغب في طلب إضافة مورد جديد إلى المنصة.");

export function ClientOnboarding() {
  const [howOpen, setHowOpen] = useState(false);

  return (
    <section
      className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8"
      dir="rtl"
      aria-labelledby="onboarding-title"
    >
      <div className="mb-6 text-center">
        <h2 id="onboarding-title" className="text-xl font-extrabold sm:text-2xl">
          ابدأ باستخدام المنصة
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          للبدء، اختر أحد الخيارات التالية
        </p>
      </div>

      {/* Steps */}
      <ol className="mb-6 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="rounded-2xl border bg-muted/30 p-4 text-center"
          >
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {s.n}
            </div>
            <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <s.icon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      {/* Actions */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
        <Button
          asChild
          size="lg"
          className="font-bold"
          onClick={() =>
            trackClient("onboarding_action", { action: "browse_vendors" })
          }
        >
          <Link to="/vendors">
            <Store className="h-5 w-5" />
            تصفّح الموردين
          </Link>
        </Button>

        <Button
          asChild
          size="lg"
          variant="outline"
          onClick={() =>
            trackClient("onboarding_action", { action: "request_vendor" })
          }
        >
          <a href={REQUEST_VENDOR_HREF} target="_blank" rel="noopener noreferrer">
            <UserPlus className="h-5 w-5" />
            طلب إضافة مورد
          </a>
        </Button>

        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            trackClient("onboarding_action", { action: "how_it_works" });
            setHowOpen(true);
          }}
        >
          <HelpCircle className="h-5 w-5" />
          كيف تعمل المنصة؟
        </Button>
      </div>

      <Dialog open={howOpen} onOpenChange={setHowOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>كيف تعمل المنصة؟</DialogTitle>
            <DialogDescription>
              منصة بسيطة تربطك بالموردين وتُسهّل الطلب والتتبّع.
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-2 space-y-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {s.n}
                </div>
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex justify-end">
            <Button asChild>
              <Link to="/vendors" onClick={() => setHowOpen(false)}>
                <Store className="h-4 w-4" />
                ابدأ الآن
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
