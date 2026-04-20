import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Users, UserCheck, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/_admin/admin/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "فريق الشركة — DistribHub" }] }),
});

function TeamPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">فريق الشركة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة المستخدمين الداخليين: المسؤولون، المديرون، ومندوبو المبيعات.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/admin/distributors">
          <Card className="p-5 shadow-soft hover:shadow-md transition-shadow h-full">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base">الموزعون والمسؤولون</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  إنشاء وتعديل حسابات الموزعين وتعيين الأدوار.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/admin/sales-agents">
          <Card className="p-5 shadow-soft hover:shadow-md transition-shadow h-full">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                <UserCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base">مندوبو المبيعات</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  ربط مندوبي المبيعات بالمناطق الجغرافية.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Card className="p-5 shadow-soft h-full opacity-70">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">الأدوار والصلاحيات</h2>
              <p className="text-xs text-muted-foreground mt-1">
                مالك الشركة، مسؤول، مدير، مندوب مبيعات. (قريباً)
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
