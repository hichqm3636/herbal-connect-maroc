import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Award, TrendingUp, Sparkles, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeAr, LEVEL_LABELS } from "@/lib/format";

export const Route = createFileRoute("/_app/loyalty")({
  component: LoyaltyPage,
  head: () => ({ meta: [{ title: "نقاط الولاء — بوابة هيرباليفي" }] }),
});

interface Tx {
  id: string;
  points: number;
  reason: string;
  created_at: string;
}

const LEVEL_THRESHOLDS = [
  { level: "distributor", min: 0, next: 500 },
  { level: "senior_consultant", min: 500, next: 1500 },
  { level: "success_builder", min: 1500, next: 4000 },
  { level: "supervisor", min: 4000, next: 10000 },
  { level: "world_team", min: 10000, next: 10000 },
];

function LoyaltyPage() {
  const { user, refreshRoles, isAdmin } = useAuth();
  const [points, setPoints] = useState(0);
  const [level, setLevel] = useState<string>("distributor");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);

  const checkAdmin = async () => {
    const { data } = await supabase.rpc("admin_exists");
    setAdminExists(Boolean(data));
  };

  useEffect(() => {
    if (!user) return;
    checkAdmin();
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("loyalty_points, level")
        .eq("id", user.id)
        .maybeSingle();
      if (prof) {
        setPoints(prof.loyalty_points);
        setLevel(prof.level);
      }
      const { data: t } = await supabase
        .from("loyalty_transactions")
        .select("id, points, reason, created_at")
        .eq("distributor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTxs(t ?? []);
    })();
  }, [user]);

  const claimAdmin = async () => {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_first_admin");
    setClaiming(false);
    if (error) {
      toast.error("تعذّر تعيينك كمسؤول");
      return;
    }
    if (data === true) {
      toast.success("تم تعيينك كمسؤول بنجاح");
      await refreshRoles();
      await checkAdmin();
    } else {
      toast.error("يوجد مسؤول بالفعل");
      await checkAdmin();
    }
  };

  const tier = LEVEL_THRESHOLDS.find((t) => t.level === level) ?? LEVEL_THRESHOLDS[0];
  const nextTier = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.findIndex((t) => t.level === level) + 1];
  const progress = nextTier ? Math.min(100, ((points - tier.min) / (nextTier.min - tier.min)) * 100) : 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">نقاط الولاء</h1>
        <p className="text-sm text-muted-foreground mt-1">تتبع مكافآتك ومستواك</p>
      </div>

      {adminExists === false && !isAdmin && (
        <Card className="p-5 border-2 border-primary/30 bg-primary/5 shadow-soft">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-bold">إعداد المسؤول الأول</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  لا يوجد مسؤول بعد. يمكنك تعيين نفسك كمسؤول للنظام بنقرة واحدة.
                </p>
              </div>
              <Button onClick={claimAdmin} disabled={claiming}>
                {claiming ? "جاري التعيين..." : "عيّنّي كمسؤول"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-gradient-primary text-primary-foreground shadow-elegant overflow-hidden relative">
        <Sparkles className="absolute -top-4 -left-4 h-32 w-32 opacity-10" />
        <div className="relative">
          <p className="text-sm opacity-90">رصيد النقاط</p>
          <p className="text-5xl font-extrabold mt-2">{points}</p>
          <div className="mt-6 flex items-center gap-2">
            <Award className="h-5 w-5" />
            <span className="font-medium">المستوى الحالي: {LEVEL_LABELS[level]}</span>
          </div>
          {nextTier && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs opacity-90">
                <span>المستوى التالي: {LEVEL_LABELS[nextTier.level]}</span>
                <span>{points} / {nextTier.min}</span>
              </div>
              <Progress value={progress} className="h-2 bg-primary-foreground/20" />
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            سجل المعاملات
          </h2>
        </div>
        {txs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">لا توجد معاملات بعد</p>
        ) : (
          <div className="divide-y">
            {txs.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{t.reason || "تعديل نقاط"}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTimeAr(t.created_at)}</p>
                </div>
                <Badge variant={t.points >= 0 ? "default" : "destructive"} className="font-bold">
                  {t.points >= 0 ? "+" : ""}{t.points}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
