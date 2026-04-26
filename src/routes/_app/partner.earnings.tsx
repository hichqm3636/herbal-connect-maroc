import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Wallet, Clock, CheckCircle2, ShoppingBag, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/StatCard";
import { formatMAD } from "@/lib/format";

export const Route = createFileRoute("/_app/partner/earnings")({
  component: PartnerEarningsPage,
});

type CommissionStatus = "pending" | "approved" | "paid" | "rejected";

interface CommissionRow {
  id: string;
  order_id: string;
  amount_mad: number;
  base_amount_mad: number;
  rate_percent: number;
  status: CommissionStatus;
  created_at: string;
  orders: { order_number: string | null } | null;
}

const statusMeta: Record<
  CommissionStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "قيد الانتظار",
    className: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  approved: {
    label: "مُعتمد",
    className: "bg-success/15 text-success border-success/30",
  },
  paid: {
    label: "مدفوع",
    className: "bg-primary/15 text-primary border-primary/30",
  },
  rejected: {
    label: "مرفوض",
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

function safeMAD(n: number): string {
  try {
    return formatMAD(n);
  } catch {
    return `${n.toFixed(2)} MAD`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-MA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function PartnerEarningsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("partner_commissions")
        .select(
          "id, order_id, amount_mad, base_amount_mad, rate_percent, status, created_at, orders(order_number)",
        )
        .eq("partner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as CommissionRow[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    const orderIds = new Set<string>();
    for (const r of rows) {
      orderIds.add(r.order_id);
      if (r.status === "pending") pending += Number(r.amount_mad) || 0;
      else if (r.status === "approved" || r.status === "paid")
        approved += Number(r.amount_mad) || 0;
    }
    return { pending, approved, ordersCount: orderIds.size };
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">أرباحي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تابع عمولاتك على الطلبات التي ولّدتها.
        </p>
      </header>

      {/* KPI cards — mobile first: stacked, then 3-up on sm+ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="قيد الانتظار"
          value={safeMAD(stats.pending)}
          icon={Clock}
          accent="warning"
        />
        <StatCard
          label="مُعتمد"
          value={safeMAD(stats.approved)}
          icon={CheckCircle2}
          accent="success"
        />
        <StatCard
          label="عدد الطلبات"
          value={String(stats.ordersCount)}
          icon={ShoppingBag}
          accent="primary"
        />
      </div>

      {/* List */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">سجل العمولات</h2>
        </div>

        {loading ? (
          <Card className="flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </Card>
        ) : error ? (
          <Card className="p-6 text-center text-sm text-destructive">
            تعذّر تحميل العمولات: {error}
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Wallet className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">لا توجد عمولات بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ستظهر هنا فور إنشاء أول طلب مرتبط بك.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const meta = statusMeta[r.status];
              return (
                <li key={r.id}>
                  <Card className="p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {r.orders?.order_number ??
                            `#${r.order_id.slice(0, 8)}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(r.created_at)} ·{" "}
                          {Number(r.rate_percent).toFixed(0)}% من{" "}
                          {safeMAD(Number(r.base_amount_mad) || 0)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-base font-bold tracking-tight">
                          {safeMAD(Number(r.amount_mad) || 0)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${meta.className}`}
                        >
                          {meta.label}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
