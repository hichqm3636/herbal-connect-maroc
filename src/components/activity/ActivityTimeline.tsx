import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  fetchCompanyActivity,
  fetchEntityActivity,
  fetchUserNames,
  type ActivityLogRow,
  type EntityType,
} from "@/lib/activityLog";
import {
  formatValue,
  labelForAction,
  labelForField,
  timeAgoAr,
} from "./ActionLabels";

interface BaseProps {
  title?: string;
  limit?: number;
  emptyText?: string;
  className?: string;
}

interface EntityProps extends BaseProps {
  entityType: EntityType;
  entityId: string;
  companyId?: never;
}

interface CompanyProps extends BaseProps {
  companyId: string;
  entityType?: never;
  entityId?: never;
}

type Props = EntityProps | CompanyProps;

export function ActivityTimeline(props: Props) {
  const { title = "سجل النشاط", limit = 50, emptyText = "لا يوجد نشاط بعد." } = props;
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data =
          "entityType" in props && props.entityType
            ? await fetchEntityActivity(props.entityType, props.entityId, limit)
            : await fetchCompanyActivity(props.companyId!, limit);
        if (cancelled) return;
        setRows(data);
        const ids = data.map((r) => r.user_id).filter((x): x is string => !!x);
        const names = await fetchUserNames(ids);
        if (!cancelled) setUsers(names);
      } catch (err) {
        console.warn("[ActivityTimeline] load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    "entityType" in props ? props.entityType : null,
    "entityId" in props ? props.entityId : null,
    "companyId" in props ? props.companyId : null,
    limit,
  ]);

  return (
    <Card className={`p-4 shadow-soft ${props.className ?? ""}`} dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        <ol className="relative space-y-3 ps-4 border-s border-border">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -start-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
              <div className="text-sm">
                <span className="font-medium">
                  {r.user_id ? users[r.user_id] ?? "مستخدم" : "النظام"}
                </span>{" "}
                <span className="text-muted-foreground">{labelForAction(r.action)}</span>
                {r.field_name && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {labelForField(r.field_name)}:{" "}
                    <span className="line-through text-muted-foreground/70">
                      {formatValue(r.old_value)}
                    </span>{" "}
                    → <span className="font-medium">{formatValue(r.new_value)}</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {timeAgoAr(r.created_at)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
