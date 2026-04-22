import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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

/**
 * In-app notifications bell. Shown to company admins (and super admins).
 * Streams new rows via Supabase Realtime so admins see new orders instantly.
 */
export function NotificationsBell() {
  const { user, isAdmin, isSuperAdmin, mode } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  const enabled = !!user && (isAdmin || isSuperAdmin) && mode !== "platform";

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as NotificationRow[]) ?? []);
  }, [user]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const channel = supabase
      .channel(`notifications:${user!.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
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

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    void load();
  };

  if (!enabled) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`الإشعارات${unread > 0 ? ` (${unread} غير مقروءة)` : ""}`}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between p-3 border-b">
          <p className="text-sm font-semibold">الإشعارات</p>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              تعليم الكل كمقروء
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              لا توجد إشعارات
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`p-3 hover:bg-muted/50 ${
                    n.read_at ? "" : "bg-primary/5"
                  }`}
                >
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <NotificationContent n={n} />
                    </Link>
                  ) : (
                    <NotificationContent n={n} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationContent({ n }: { n: NotificationRow }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{n.title}</p>
        {!n.read_at && (
          <Badge variant="default" className="shrink-0 h-1.5 w-1.5 p-0 rounded-full" />
        )}
      </div>
      {n.body && (
        <p className="text-xs text-muted-foreground leading-snug">{n.body}</p>
      )}
      <p className="text-[10px] text-muted-foreground">{formatDateAr(n.created_at)}</p>
    </div>
  );
}
