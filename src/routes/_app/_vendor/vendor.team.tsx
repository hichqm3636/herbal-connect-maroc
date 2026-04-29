import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Users, UserCheck, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/_vendor/vendor/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "فريق البائع" }] }),
});

function TeamPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">فريق البائع</h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة المستخدمين الداخليين لمتجرك.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/vendor">
          <Card className="p-5 shadow-soft hover:shadow-md transition-shadow h-full">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base">أعضاء الفريق</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  دعوة وتعديل أعضاء فريق المتجر.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Card className="p-5 shadow-soft h-full opacity-70">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <UserCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">الدعوات المعلّقة</h2>
              <p className="text-xs text-muted-foreground mt-1">قريباً.</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-soft h-full opacity-70">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base">الأدوار والصلاحيات</h2>
              <p className="text-xs text-muted-foreground mt-1">قريباً.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
