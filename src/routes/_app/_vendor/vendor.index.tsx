import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/_vendor/vendor/")({
  component: () => (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-2xl font-bold">لوحة تحكم البائع</h1>
      <Card className="p-6 text-sm text-muted-foreground">
        مرحباً بك في مساحة عمل البائع. لوحة التحكم الكاملة قيد البناء.
      </Card>
    </div>
  ),
});
