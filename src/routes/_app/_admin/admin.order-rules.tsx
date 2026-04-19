import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { OrderRulesManager } from "@/components/admin/OrderRulesManager";

export const Route = createFileRoute("/_app/_admin/admin/order-rules")({
  component: AdminOrderRulesPage,
  head: () => ({ meta: [{ title: "قواعد الطلب — DistribHub" }] }),
});

function AdminOrderRulesPage() {
  const { companyId } = useAuth();
  if (!companyId) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <OrderRulesManager
      companyScope={companyId}
      title="قواعد الطلب"
      description="حدّد متطلبات الحد الأدنى للطلب الخاصة بشركتك. تُضاف فوق قواعد المنصة العامة."
    />
  );
}
