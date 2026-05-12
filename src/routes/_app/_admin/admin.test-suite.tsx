import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/_admin/admin/test-suite")({
  component: AdminTestSuitePage,
  head: () => ({ meta: [{ title: "اختبار الـ Backend — الإدارة" }] }),
});

interface CountCheck {
  label: string;
  table: string;
  count: number | null;
  error: string | null;
  loading: boolean;
}

interface RlsCheck {
  label: string;
  status: "pass" | "fail" | "running" | "idle";
  detail: string;
}

const TABLES = [
  { label: "المنتجات", table: "products" },
  { label: "الطلبات", table: "orders" },
  { label: "عناصر الطلبات", table: "order_items" },
  { label: "المستخدمون (profiles)", table: "profiles" },
  { label: "الأدوار (user_roles)", table: "user_roles" },
  { label: "الشركات", table: "companies" },
  { label: "الفواتير", table: "invoices" },
  { label: "نقاط الولاء", table: "loyalty_transactions" },
] as const;

function AdminTestSuitePage() {
  const [counts, setCounts] = useState<CountCheck[]>([]);
  const [rlsChecks, setRlsChecks] = useState<RlsCheck[]>([
    { label: "anon لا يستطيع قراءة profiles", status: "idle", detail: "" },
    { label: "anon لا يستطيع قراءة orders", status: "idle", detail: "" },
    { label: "anon لا يستطيع قراءة user_roles", status: "idle", detail: "" },
    { label: "anon يستطيع رؤية المنتجات النشطة فقط", status: "idle", detail: "" },
    { label: "anon يرى الشركات المُدرجة (is_listed=true)", status: "idle", detail: "" },
  ]);
  const [running, setRunning] = useState(false);

  const loadCounts = async () => {
    const initial: CountCheck[] = TABLES.map((t) => ({
      ...t,
      count: null,
      error: null,
      loading: true,
    }));
    setCounts(initial);
    const results = await Promise.all(
      TABLES.map(async (t) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count, error } = await (supabase as any)
          .from(t.table)
          .select("*", { count: "exact", head: true });
        return {
          ...t,
          count: count ?? 0,
          error: error?.message ?? null,
          loading: false,
        } as CountCheck;
      }),
    );
    setCounts(results);
  };

  const runRls = async () => {
    setRunning(true);
    // Use a separate anonymous client (no session) to test public surface.
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const probes: Array<() => Promise<RlsCheck>> = [
      async () => {
        const res = await fetch(
          `${url}/rest/v1/profiles?select=id&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const body = await res.json().catch(() => null);
        const leaked = Array.isArray(body) && body.length > 0;
        return {
          label: "anon لا يستطيع قراءة profiles",
          status: leaked ? "fail" : "pass",
          detail: leaked ? `تسرب ${body.length} سجل` : `RLS فعّال (${res.status})`,
        };
      },
      async () => {
        const res = await fetch(
          `${url}/rest/v1/orders?select=id&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const body = await res.json().catch(() => null);
        const leaked = Array.isArray(body) && body.length > 0;
        return {
          label: "anon لا يستطيع قراءة orders",
          status: leaked ? "fail" : "pass",
          detail: leaked ? `تسرب ${body.length} سجل` : `RLS فعّال (${res.status})`,
        };
      },
      async () => {
        const res = await fetch(
          `${url}/rest/v1/user_roles?select=id&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const body = await res.json().catch(() => null);
        const leaked = Array.isArray(body) && body.length > 0;
        return {
          label: "anon لا يستطيع قراءة user_roles",
          status: leaked ? "fail" : "pass",
          detail: leaked ? `تسرب ${body.length} سجل` : `RLS فعّال (${res.status})`,
        };
      },
      async () => {
        const res = await fetch(
          `${url}/rest/v1/products?select=id,active&limit=200`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const body = (await res.json().catch(() => [])) as Array<{ active: boolean }>;
        const inactive = Array.isArray(body) ? body.filter((p) => !p.active).length : -1;
        return {
          label: "anon يستطيع رؤية المنتجات النشطة فقط",
          status: inactive === 0 ? "pass" : "fail",
          detail:
            inactive === 0
              ? `${body.length} منتج نشط فقط مرئي`
              : `${inactive} منتج غير نشط مكشوف ⚠️`,
        };
      },
      async () => {
        const res = await fetch(
          `${url}/rest/v1/companies?select=id,is_listed&limit=200`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        const body = (await res.json().catch(() => [])) as Array<{ is_listed: boolean }>;
        const unlisted = Array.isArray(body) ? body.filter((c) => !c.is_listed).length : -1;
        return {
          label: "anon يرى الشركات المُدرجة (is_listed=true)",
          status: unlisted === 0 ? "pass" : "fail",
          detail:
            unlisted === 0
              ? `${body.length} شركة مُدرجة فقط`
              : `${unlisted} شركة غير مُدرجة مكشوفة ⚠️`,
        };
      },
    ];

    const results: RlsCheck[] = [];
    for (const p of probes) {
      try {
        results.push(await p());
      } catch (e) {
        results.push({
          label: "خطأ",
          status: "fail",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setRlsChecks(results);
    setRunning(false);
  };

  useEffect(() => {
    loadCounts();
    runRls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            اختبار الـ Backend
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحقّق سريع من الجداول الأساسية وسياسات RLS باستخدام مفتاح anon.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadCounts();
            runRls();
          }}
          disabled={running}
        >
          <RefreshCw className={running ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          إعادة الفحص
        </Button>
      </div>

      <section>
        <h2 className="font-bold mb-3">عدد السجلات</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {counts.map((c) => (
            <Card key={c.table} className="p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-xs font-mono text-muted-foreground/70">
                {c.table}
              </div>
              <div className="mt-2 text-2xl font-bold">
                {c.loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : c.error ? (
                  <span className="text-sm text-destructive">{c.error}</span>
                ) : (
                  c.count
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-bold mb-3">فحوصات RLS (anon role)</h2>
        <div className="space-y-2">
          {rlsChecks.map((r, i) => (
            <Card key={i} className="p-3 flex items-center gap-3">
              {r.status === "pass" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : r.status === "fail" ? (
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
              <Badge
                variant={
                  r.status === "pass"
                    ? "default"
                    : r.status === "fail"
                      ? "destructive"
                      : "secondary"
                }
              >
                {r.status === "pass"
                  ? "ناجح"
                  : r.status === "fail"
                    ? "فاشل"
                    : "..."}
              </Badge>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
