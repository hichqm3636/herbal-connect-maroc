import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Trash2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/super-admin/errors")({
  component: ErrorLogsPage,
  head: () => ({ meta: [{ title: "سجل الأخطاء — Nexora" }] }),
});

interface ErrorRow {
  id: string;
  created_at: string;
  severity: string;
  message: string;
  stack: string | null;
  url: string | null;
  route: string | null;
  user_agent: string | null;
  user_id: string | null;
  context: Record<string, unknown> | null;
}

const SEVERITY_TONE: Record<string, string> = {
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

function ErrorLogsPage() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_error_logs")
      .select("id, created_at, severity, message, stack, url, route, user_agent, user_id, context")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("تعذّر تحميل سجل الأخطاء");
    } else {
      setRows((data ?? []) as ErrorRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function clearOld() {
    if (!confirm("حذف السجلات الأقدم من 30 يوماً؟")) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("client_error_logs")
      .delete()
      .lt("created_at", cutoff);
    if (error) {
      toast.error("فشل الحذف");
    } else {
      toast.success("تم حذف السجلات القديمة");
      void load();
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">سجل الأخطاء</h1>
          <p className="text-sm text-muted-foreground">
            آخر 200 خطأ مسجَّل من جانب العميل (frontend).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="ml-1 h-4 w-4" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => void clearOld()}>
            <Trash2 className="ml-1 h-4 w-4" />
            حذف +30 يوماً
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-10 text-center">
          <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">لا توجد أخطاء مسجَّلة</p>
          <p className="text-sm text-muted-foreground">
            سيظهر هنا أي خطأ يحدث في واجهة المستخدم.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <Card key={r.id} className="p-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="flex w-full items-start justify-between gap-3 text-right"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={SEVERITY_TONE[r.severity] ?? SEVERITY_TONE.error}>
                        {r.severity}
                      </Badge>
                      {r.route && (
                        <span className="truncate text-xs text-muted-foreground">{r.route}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{r.message}</p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("ar-MA")}
                  </time>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                    {r.url && (
                      <div>
                        <span className="font-semibold">URL: </span>
                        <span className="break-all text-muted-foreground">{r.url}</span>
                      </div>
                    )}
                    {r.user_id && (
                      <div>
                        <span className="font-semibold">User: </span>
                        <span className="text-muted-foreground">{r.user_id}</span>
                      </div>
                    )}
                    {r.user_agent && (
                      <div>
                        <span className="font-semibold">UA: </span>
                        <span className="break-all text-muted-foreground">{r.user_agent}</span>
                      </div>
                    )}
                    {r.context && (
                      <div>
                        <span className="font-semibold">Context: </span>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px]">
                          {JSON.stringify(r.context, null, 2)}
                        </pre>
                      </div>
                    )}
                    {r.stack && (
                      <div>
                        <span className="font-semibold">Stack: </span>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[11px]" dir="ltr">
                          {r.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
