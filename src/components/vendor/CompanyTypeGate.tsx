import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Pill, Leaf, FlaskConical, Stethoscope, Dumbbell, Package, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPES = [
  { key: "pharmacy", label: "أدوية", icon: Pill, hint: "صيدليات ومستودعات أدوية" },
  { key: "supplements", label: "مكملات غذائية", icon: FlaskConical, hint: "Whey, Vitamins, Protein" },
  { key: "herbs", label: "أعشاب طبية", icon: Leaf, hint: "منتجات طبيعية وعشبية" },
  { key: "medical_supplies", label: "مستلزمات طبية", icon: Stethoscope, hint: "أجهزة ومستلزمات عيادات" },
  { key: "sports_supplies", label: "مستلزمات رياضية", icon: Dumbbell, hint: "معدات وملابس رياضية" },
  { key: "other", label: "أخرى", icon: Package, hint: "قطاع آخر" },
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
    return () => { cancelled = true; };
  }, [companyId]);

  const save = async () => {
    if (!selected || !companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({ company_type: selected as never })
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      toast.error("تعذر حفظ نوع الشركة");
      return;
    }
    toast.success("تم — لنبدأ إعداد متجرك");
    setOpen(false);
  };

  if (loading) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* blocking */ }}>
      <DialogContent className="max-w-2xl" dir="rtl" hideClose>
        <DialogHeader>
          <DialogTitle className="text-xl">مرحبًا بك في Nexora 👋</DialogTitle>
          <DialogDescription>
            اختر القطاع الذي تعمل فيه شركتك لنخصص لك أفضل تجربة.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = selected === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelected(t.key)}
                className={cn(
                  "relative rounded-xl border p-4 text-right transition-all hover:border-primary/60 hover:shadow-sm",
                  active && "border-primary bg-primary/5 shadow-elegant"
                )}
              >
                {active && (
                  <CheckCircle2 className="absolute left-2 top-2 h-4 w-4 text-primary" />
                )}
                <Icon className={cn("h-6 w-6 mb-2", active ? "text-primary" : "text-muted-foreground")} />
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={!selected || saving} className="bg-gradient-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            متابعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
