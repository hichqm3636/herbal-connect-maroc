import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, ClipboardList, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/_app/_admin/admin/")({
  component: AdminHome,
  head: () => ({ meta: [{ title: "لوحة الإدارة" }] }),
});

function AdminHome() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">لوحة الإدارة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          الإشراف على المنصة: الشركات، المستخدمون، والإبلاغات.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">الشركات</h2>
              <p className="text-xs text-muted-foreground mt-1">
                مراجعة الشركات المنضمّة إلى المنصة.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/admin/companies">عرض الشركات</Link>
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-soft opacity-70">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">المستخدمون</h2>
              <p className="text-xs text-muted-foreground mt-1">قريباً.</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-soft opacity-70">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning-foreground">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">الإبلاغات</h2>
              <p className="text-xs text-muted-foreground mt-1">قريباً.</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-soft border-primary/20">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">اختبار الـ Backend</h2>
              <p className="text-xs text-muted-foreground mt-1">
                فحص الجداول وسياسات RLS وعدد السجلات.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/admin/test-suite">فتح أداة الاختبار</Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
