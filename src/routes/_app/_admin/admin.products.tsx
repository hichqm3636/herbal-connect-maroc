import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/_admin/admin/products")({
  component: () => (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-2xl font-bold">المنتجات</h1>
      <Card className="p-6 text-sm text-muted-foreground">قيد البناء.</Card>
    </div>
  ),
});
