import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, Check, Trash2, Package, CreditCard, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateAr } from "@/lib/format";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

type Category = "all" | "orders" | "payments" | "other";

const CATEGORY_FOR_KIND: Record<string, Category> = {
  order_created: "orders",
  order_status_changed: "orders",
  payment_status_changed: "payments",
  payment_awaiting_confirmation: "payments",
};

function categoryOf(kind: string): Category {
  return CATEGORY_FOR_KIND[kind] ?? "other";
}

function iconFor(kind: string) {
  const cat = categoryOf(kind);
  if (cat === "orders") return <Package className="h-4 w-4" />;
  if (cat === "payments") return <CreditCard className="h-4 w-4" />;
  return <Bell className="h-4 w-4" />;
}

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [{ title: "الإشعارات" }],
  }),
});

function NotificationsPage() {
  const { user, mode } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Category>("all");

  const enabled = !!user && mode !== "platform";

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error("تعذر تحميل الإشعارات");
    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const channel = supabase
      .channel(`notif-page:${user!.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user!.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, user, load]);

  const counts = useMemo(() => {
    const c = { all: items.length, orders: 0, payments: 0, other: 0 };
    for (const n of items) {
      const cat = categoryOf(n.kind);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at).length,
    [items],
  );

  const visible = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((n) => categoryOf(n.kind) === tab);
  }, [items, tab]);

  const markOne = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("تعذر تعليم الإشعار كمقروء");
      return;
    }
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
  };

  const markAll = async () => {
    if (!user || unreadCount === 0) return;
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      toast.error("تعذر التعليم");
      return;
    }
    toast.success(`تم تعليم ${ids.length} إشعار كمقروء`);
    void load();
  };

  const removeOne = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("تعذر الحذف");
      return;
    }
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  const openLink = async (n: NotificationRow) => {
    if (!n.read_at) await markOne(n.id);
    if (n.link) navigate({ to: n.link });
  };

  if (!enabled) {
    return (
      <div className="container max-w-3xl py-8">
        <EmptyState
          icon={Bell}
          title="غير متوفر"
          description="يجب تسجيل الدخول لعرض الإشعارات"
        />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            الإشعارات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0
              ? `${unreadCount} إشعار غير مقروء`
              : "لا توجد إشعارات غير مقروءة"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAll}>
            <Check className="h-4 w-4 me-1" />
            تعليم الكل كمقروء
          </Button>
        )}
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Category)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">
            الكل
            <Badge variant="secondary" className="ms-2 h-5 px-1.5 text-[10px]">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="orders">
            الطلبات
            <Badge variant="secondary" className="ms-2 h-5 px-1.5 text-[10px]">
              {counts.orders}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="payments">
            الدفع
            <Badge variant="secondary" className="ms-2 h-5 px-1.5 text-[10px]">
              {counts.payments}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="other">
            أخرى
            <Badge variant="secondary" className="ms-2 h-5 px-1.5 text-[10px]">
              {counts.other}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Inbox}
            title="لا توجد إشعارات"
            description="ستظهر إشعارات الطلبات والدفع هنا فور وقوعها."
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => (
            <Card
              key={n.id}
              className={`p-3 transition-colors ${
                n.read_at ? "" : "bg-primary/5 border-primary/30"
              }`}
            >
              <li className="flex items-start gap-3">
                <div
                  className={`shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center ${
                    n.read_at
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary"
                  }`}
                  aria-hidden
                >
                  {iconFor(n.kind)}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => void openLink(n)}
                    className="text-start w-full block hover:opacity-80"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">
                        {n.title}
                      </p>
                      {!n.read_at && (
                        <span
                          className="shrink-0 h-2 w-2 rounded-full bg-primary mt-1.5"
                          aria-label="غير مقروء"
                        />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground leading-snug mt-1">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {formatDateAr(n.created_at)}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 mt-2">
                    {n.link && (
                      <Link
                        to={n.link}
                        onClick={() => {
                          if (!n.read_at) void markOne(n.id);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        فتح
                      </Link>
                    )}
                    {!n.read_at && (
                      <button
                        type="button"
                        onClick={() => void markOne(n.id)}
                        className="text-xs text-muted-foreground hover:text-foreground ms-auto"
                      >
                        تعليم كمقروء
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void removeOne(n.id)}
                      aria-label="حذف"
                      className="text-muted-foreground hover:text-destructive p-1 ms-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
