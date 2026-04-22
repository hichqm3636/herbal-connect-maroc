import { useEffect, useMemo, useState } from "react";
import { Loader2, History } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchCompanyActivityPage,
  fetchEntityActivityPage,
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
  /** Page size for "Load more". Defaults to 50. */
  pageSize?: number;
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

type FilterKey = "all" | "order" | "product" | "company";

const FILTERS: { key: FilterKey; label: string; types: EntityType[] }[] = [
  { key: "all", label: "الكل", types: [] },
  { key: "order", label: "الطلبات", types: ["order"] },
  { key: "product", label: "المنتجات", types: ["product"] },
  { key: "company", label: "إعدادات الشركة", types: ["company"] },
];

function EntityLink({ row, children }: { row: ActivityLogRow; children: React.ReactNode }) {
  if (!row.entity_id) return <>{children}</>;
  if (row.entity_type === "order") {
    return (
      <Link
        to="/admin/orders/$orderId"
        params={{ orderId: row.entity_id }}
        className="hover:underline text-primary"
      >
        {children}
      </Link>
    );
  }
  if (row.entity_type === "product") {
    return (
      <Link
        to="/products/$productId"
        params={{ productId: row.entity_id }}
        className="hover:underline text-primary"
      >
        {children}
      </Link>
    );
  }
  return <>{children}</>;
}

export function ActivityTimeline(props: Props) {
  const {
    title = "سجل النشاط",
    pageSize = 50,
    emptyText = "لا يوجد نشاط بعد.",
  } = props;
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const isCompanyView = "companyId" in props && !!props.companyId;

  const fetchPage = async (offset: number): Promise<ActivityLogRow[]> => {
    if ("entityType" in props && props.entityType) {
      return fetchEntityActivityPage(props.entityType, props.entityId, offset, pageSize);
    }
    return fetchCompanyActivityPage(props.companyId!, offset, pageSize);
  };

  const mergeUserNames = async (newRows: ActivityLogRow[]) => {
    const ids = newRows.map((r) => r.user_id).filter((x): x is string => !!x);
    if (ids.length === 0) return;
    const names = await fetchUserNames(ids);
    setUsers((prev) => ({ ...prev, ...names }));
  };

  // Initial load (and reload when entity / company changes).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setRows([]);
      setHasMore(true);
      try {
        const data = await fetchPage(0);
        if (cancelled) return;
        setRows(data);
        setHasMore(data.length === pageSize);
        await mergeUserNames(data);
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
    pageSize,
  ]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...next]);
      setHasMore(next.length === pageSize);
      await mergeUserNames(next);
    } catch (err) {
      console.warn("[ActivityTimeline] load more failed", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    const allowed = FILTERS.find((f) => f.key === filter)?.types ?? [];
    if (allowed.length === 0) return rows;
    return rows.filter((r) => allowed.includes(r.entity_type as EntityType));
  }, [rows, filter]);

  return (
    <Card className={`p-4 shadow-soft ${props.className ?? ""}`} dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {isCompanyView && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? rows.length
                : rows.filter((r) => f.types.includes(r.entity_type as EntityType)).length;
            return (
              <Button
                key={f.key}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
                className="h-7 px-2.5 text-xs"
              >
                {f.label}
                <span className="ms-1 text-[10px] opacity-70">({count})</span>
              </Button>
            );
          })}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        <>
          <ol className="relative space-y-3 ps-4 border-s border-border">
            {filteredRows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -start-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                <div className="text-sm">
                  <span className="font-medium">
                    {r.user_id ? users[r.user_id] ?? "مستخدم" : "النظام"}
                  </span>{" "}
                  <EntityLink row={r}>
                    <span className="text-muted-foreground hover:text-foreground">
                      {labelForAction(r.action)}
                    </span>
                  </EntityLink>
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
          {hasMore && (
            <div className="flex justify-center mt-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
                className="h-8"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin ms-1" />
                    جاري التحميل…
                  </>
                ) : (
                  "تحميل المزيد"
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
