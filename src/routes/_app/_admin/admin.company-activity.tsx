import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";

export const Route = createFileRoute("/_app/_admin/admin/company-activity")({
  component: CompanyActivityPage,
  head: () => ({ meta: [{ title: "نشاط الشركة" }] }),
});

function CompanyActivityPage() {
  const { companyId } = useAuth();
  if (!companyId) {
    return (
      <div className="text-center py-20 text-muted-foreground" dir="rtl">
        لا توجد شركة مرتبطة بحسابك.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          نشاط الشركة
        </h1>
        <p className="text-sm text-muted-foreground">
          سجل كامل لجميع التعديلات والإجراءات داخل الشركة (طلبات، منتجات، إعدادات).
        </p>
      </div>
      <ActivityTimeline companyId={companyId} title="آخر النشاطات" limit={200} />
    </div>
  );
}
