import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  CheckCircle2,
  Circle,
  Building2,
  Users,
  Package,
  ShoppingBag,
  FileText,
  Rocket,
  ChevronLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  done: boolean;
}

export function OnboardingChecklist() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const [companyRes, productsRes, ordersRes, invoicesRes, teamRes] = await Promise.all([
        supabase.from("companies").select("company_type, contact_phone, address, logo_url, onboarding_state").eq("id", companyId).maybeSingle(),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);
      if (cancelled) return;

      const c = companyRes.data;
      const state = (c?.onboarding_state ?? {}) as Record<string, boolean>;
      setDismissed(!!state.dismissed);

      const basics = !!(c?.contact_phone && c?.address);
      const team = (teamRes.count ?? 0) > 1;
      const products = (productsRes.count ?? 0) > 0;
      const orders = (ordersRes.count ?? 0) > 0;
      const invoices = (invoicesRes.count ?? 0) > 0;

      setSteps([
        { key: "type", title: "نوع الشركة", hint: "حدّد قطاع نشاطك", icon: Building2, to: "/vendor/branding", done: !!c?.company_type },
        { key: "basics", title: "البيانات الأساسية", hint: "الهاتف، العنوان، الشعار", icon: Building2, to: "/vendor/branding", done: basics },
        { key: "team", title: "إضافة موظفين", hint: "ادعُ فريقك للعمل معًا", icon: Users, to: "/vendor/team", done: team },
        { key: "products", title: "أول منتج", hint: "أضف يدويًا أو استورد من CSV/WooCommerce", icon: Package, to: "/vendor/products", done: products },
        { key: "orders", title: "أول طلب", hint: "اقبل طلبًا أو أنشئ طلبًا تجريبيًا", icon: ShoppingBag, to: "/vendor/orders", done: orders },
        { key: "invoices", title: "أول فاتورة", hint: "أصدر فاتورة احترافية", icon: FileText, to: "/vendor/invoices", done: invoices },
      ]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const dismiss = async () => {
    if (!companyId) return;
    setDismissed(true);
    await supabase
      .from("companies")
      .update({ onboarding_state: { dismissed: true } as never })
      .eq("id", companyId);
  };

  if (loading || dismissed || steps.length === 0) return null;
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  if (doneCount === steps.length) return null;

  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-5 shadow-elegant" dir="rtl">
      <button
        type="button"
        onClick={dismiss}
        className="absolute left-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="إخفاء"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold">لنُطلق متجرك 🚀</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            أكمل الخطوات التالية للوصول إلى أول قيمة بسرعة
          </p>
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold text-primary">{pct}%</div>
          <div className="text-[10px] text-muted-foreground">{doneCount}/{steps.length}</div>
        </div>
      </div>

      <Progress value={pct} className="h-2 mb-5" />

      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              to={s.to}
              className={cn(
                "group flex items-center gap-3 rounded-lg border p-3 transition-all hover:border-primary/40 hover:bg-primary/5",
                s.done && "border-primary/30 bg-primary/5 opacity-70"
              )}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-semibold truncate", s.done && "line-through")}>{s.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{s.hint}</div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </Link>
          );
        })}
      </div>

      {nextStep && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/10 p-3">
          <div className="text-sm">
            <span className="text-muted-foreground">التالي: </span>
            <span className="font-semibold">{nextStep.title}</span>
          </div>
          <Button asChild size="sm" className="bg-gradient-primary">
            <Link to={nextStep.to}>ابدأ الآن</Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
