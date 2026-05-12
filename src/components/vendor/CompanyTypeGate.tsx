import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Pill, Leaf, FlaskConical, Stethoscope, Dumbbell, Package, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPES = [
  {
    key: "pharmacy",
    label: "شركة أدوية",
    icon: Pill,
    desc: "إدارة الأدوية، الوصفات، التحصيل، والصيدليات الشريكة",
  },
  {
    key: "supplements",
    label: "شركة مكملات غذائية",
    icon: FlaskConical,
    desc: "بروتين، فيتامينات، ومنتجات الأداء واللياقة",
  },
  {
    key: "herbs",
    label: "تعاونية أعشاب طبية",
    icon: Leaf,
    desc: "منتجات طبيعية وعشبية مع تتبع الموردين والمحاصيل",
  },
  {
    key: "medical_supplies",
    label: "شركة مستلزمات طبية",
    icon: Stethoscope,
    desc: "أجهزة ومعدات للعيادات والمستشفيات والمراكز الصحية",
  },
  {
    key: "sports_supplies",
    label: "شركة مستلزمات رياضية",
    icon: Dumbbell,
    desc: "معدات وملابس ومكملات رياضية للمحلات والنوادي",
  },
  {
    key: "other",
    label: "أخرى",
    icon: Package,
    desc: "قطاع آخر — سنخصص لك تجربة عامة مرنة",
  },
] as const;

export function CompanyTypeGate() {
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("company_type")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (!data?.company_type) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const save = async (value?: string) => {
    const v = value ?? selected;
    if (!v || !companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({ company_type: v as never })
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      toast.error("تعذر حفظ نوع الشركة");
      return;
    }
    toast.success("تم — لنبدأ إعداد متجرك");
    setOpen(false);
  };

  const skip = async () => {
    await save("other");
  };

  if (loading) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* blocking */ }}>
      <DialogContent
        className="max-w-3xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden w-[calc(100vw-1rem)] max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-2xl"
        dir="rtl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="bg-gradient-primary px-5 py-5 sm:px-6 sm:py-7 text-primary-foreground shrink-0">
          <div className="flex items-center gap-2 text-[11px] sm:text-xs font-medium opacity-90">
            <Sparkles className="h-3.5 w-3.5" />
            مرحبًا بك في Nexora
          </div>
          <h2 className="mt-1.5 text-lg sm:text-2xl font-extrabold tracking-tight leading-tight">
            أدِر شركتك الصحية من مكان واحد
          </h2>
          <p className="mt-1 text-xs sm:text-sm opacity-90 leading-relaxed">
            ابدأ بإعداد مساحتك لتناسب نشاطك وعملياتك اليومية.
          </p>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 min-h-0">
          <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4 leading-relaxed">
            اختر نوع شركتك لنضبط Nexora وفق طريقة عملك — يمكنك تعديل هذا لاحقًا من الإعدادات.
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = selected === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelected(t.key)}
                  className={cn(
                    "relative flex items-start gap-3 rounded-xl border bg-card p-3.5 text-right transition-all",
                    "hover:border-primary/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    active && "border-primary bg-primary/5 shadow-elegant"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{t.label}</div>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <div className="text-[11.5px] leading-relaxed text-muted-foreground mt-0.5">
                      {t.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer — sticky */}
        <div className="shrink-0 border-t bg-background px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={skip}
            disabled={saving}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            سأحدد هذا لاحقًا
          </button>
          <Button
            onClick={() => save()}
            disabled={!selected || saving}
            className="bg-gradient-primary min-w-28 sm:min-w-32"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            متابعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
