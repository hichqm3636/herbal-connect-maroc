import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/super-admin/")({
  component: () => (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-2xl font-bold">لوحة المنصة</h1>
      <Card className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          إدارة الشركات المنضمّة إلى المنصة.
        </p>
        <Button asChild><Link to="/super-admin/companies">عرض الشركات</Link></Button>
      </Card>
    </div>
  ),
});
