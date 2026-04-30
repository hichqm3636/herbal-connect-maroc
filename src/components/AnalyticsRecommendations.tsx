import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, ShoppingCart, CreditCard, Route as RouteIcon } from "lucide-react";

interface Funnel {
  views: number;
  add_to_cart: number;
  checkout_view: number;
  completed: number;
}

interface Recommendation {
  id: string;
  severity: "high" | "medium" | "low";
  icon: React.ReactNode;
  title: string;
  reason: string;
  actions: string[];
}

/**
 * Translates funnel numbers into vendor-actionable recommendations.
 * Thresholds (kept in sync with analytics_alerts RPC):
 *  - cart_rate         < 5%  → product page issue
 *  - abandonment_rate  > 50% → checkout page issue
 *  - conversion_rate   < 1%  → end-to-end purchase path issue
 */
function buildRecommendations(f: Funnel): Recommendation[] {
  const recs: Recommendation[] = [];
  if (!f || f.views <= 0) return recs;

  const cartRate = (f.add_to_cart / f.views) * 100;
  const conversionRate = (f.completed / f.views) * 100;
  const abandonmentRate =
    f.checkout_view > 0 ? ((f.checkout_view - f.completed) / f.checkout_view) * 100 : 0;

  if (f.views >= 10 && cartRate < 5) {
    recs.push({
      id: "weak_cart",
      severity: "high",
      icon: <ShoppingCart className="h-4 w-4" />,
      title: "تحسين صفحة المنتج",
      reason: `معدل الإضافة للسلة منخفض (${cartRate.toFixed(1)}%). الزوار يشاهدون لكن لا يضيفون.`,
      actions: [
        "تحسين جودة وعدد الصور (4 صور على الأقل + صورة استخدام)",
        "إبراز السعر بوضوح وإضافة مقارنة سعرية أو خصم واضح",
        "إضافة عناصر ثقة (تقييمات، ضمان، شحن، إرجاع)",
        "زر CTA واضح ومميز بصرياً (أضف للسلة / اشترِ الآن)",
      ],
    });
  }

  if (f.checkout_view >= 3 && abandonmentRate > 50) {
    recs.push({
      id: "high_abandonment",
      severity: "high",
      icon: <CreditCard className="h-4 w-4" />,
      title: "تحسين صفحة الدفع",
      reason: `${abandonmentRate.toFixed(0)}% من المستخدمين يتركون عملية الدفع بعد بدئها.`,
      actions: [
        "تقليل الحقول المطلوبة إلى الحد الأدنى (الاسم، الهاتف، العنوان)",
        "توضيح طرق الدفع المتاحة وإبرازها في الأعلى",
        "إظهار ملخص الطلب والشحن بوضوح قبل الدفع",
        "إضافة خيار الدفع عبر WhatsApp كبديل لتقليل الاحتكاك",
      ],
    });
  }

  if (f.views >= 20 && conversionRate < 1) {
    recs.push({
      id: "low_conversion",
      severity: "medium",
      icon: <RouteIcon className="h-4 w-4" />,
      title: "تحسين مسار الشراء بالكامل",
      reason: `معدل التحويل النهائي منخفض جداً (${conversionRate.toFixed(2)}%).`,
      actions: [
        "مراجعة كل خطوة من المنتج → السلة → الدفع → التأكيد",
        "تتبع نقطة الفقدان الأكبر في القمع وحلها أولاً",
        "اختبار A/B لنسخ مختلفة من زر الشراء وعرض السعر",
        "متابعة العملاء الذين تركوا السلة عبر WhatsApp",
      ],
    });
  }

  return recs;
}

const SEVERITY_LABEL: Record<Recommendation["severity"], string> = {
  high: "أولوية عالية",
  medium: "أولوية متوسطة",
  low: "أولوية منخفضة",
};

export function AnalyticsRecommendations({ funnel }: { funnel: Funnel | null | undefined }) {
  if (!funnel) return null;
  const recs = buildRecommendations(funnel);

  if (recs.length === 0) {
    return (
      <Card className="p-4 border-success/40 bg-success/5">
        <div className="flex items-center gap-2 text-success">
          <Lightbulb className="h-5 w-5" />
          <h2 className="font-bold">الأداء جيد — لا توجد توصيات حرجة حالياً</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          استمر في مراقبة القمع وجرّب تحسينات تدريجية عبر اختبارات A/B.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="font-bold mb-3 flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" /> توصيات لتحسين الأداء
      </h2>
      <div className="space-y-3">
        {recs.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border bg-card p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                {r.icon}
              </span>
              <h3 className="font-semibold">{r.title}</h3>
              <Badge
                variant={r.severity === "high" ? "destructive" : "secondary"}
                className="ms-auto"
              >
                {SEVERITY_LABEL[r.severity]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{r.reason}</p>
            <ul className="space-y-1 text-sm list-disc ps-5 marker:text-primary">
              {r.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
