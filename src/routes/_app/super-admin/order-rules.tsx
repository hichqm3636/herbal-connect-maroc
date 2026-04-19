import { createFileRoute } from "@tanstack/react-router";
import { OrderRulesManager } from "@/components/admin/OrderRulesManager";

export const Route = createFileRoute("/_app/super-admin/order-rules")({
  component: SuperAdminOrderRulesPage,
  head: () => ({ meta: [{ title: "قواعد الطلب العالمية — DistribHub" }] }),
});

function SuperAdminOrderRulesPage() {
  return (
    <OrderRulesManager
      companyScope={null}
      title="قواعد الطلب العالمية"
      description="قواعد المنصة المطبّقة على جميع الشركات. يمكن للشركات إضافة قواعد أكثر تشدّداً فوقها."
    />
  );
}
