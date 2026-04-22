import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { fetchLastEdit, fetchUserNames, type EntityType } from "@/lib/activityLog";
import { timeAgoAr } from "./ActionLabels";

interface Props {
  entityType: EntityType;
  entityId: string;
  className?: string;
}

/** Small inline indicator: "Last edited by Ahmed • 3 minutes ago". */
export function LastEditedLabel({ entityType, entityId, className }: Props) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await fetchLastEdit(entityType, entityId);
      if (cancelled || !row) return;
      const names = row.user_id ? await fetchUserNames([row.user_id]) : {};
      const who = row.user_id ? names[row.user_id] ?? "مستخدم" : "النظام";
      if (!cancelled) setText(`آخر تعديل بواسطة ${who} • ${timeAgoAr(row.created_at)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (!text) return null;
  return (
    <p
      className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${className ?? ""}`}
      dir="rtl"
    >
      <Pencil className="h-3 w-3" />
      {text}
    </p>
  );
}
