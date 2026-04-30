import { useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StarRating } from "@/components/StarRating";
import { supabase } from "@/integrations/supabase/client";
import { formatDateAr } from "@/lib/format";

interface Props {
  kind: "product" | "vendor";
  productId?: string;
  companyId?: string;
  /** Optional: shows a header summary above the list */
  showSummary?: boolean;
}

interface ReviewRow {
  id: string;
  user_id: string;
  rating: number;
  title?: string | null;
  body: string | null;
  created_at: string;
  vendor_response: string | null;
  vendor_responded_at: string | null;
}

interface AuthorRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function ReviewsList({ kind, productId, companyId, showSummary = true }: Props) {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [authors, setAuthors] = useState<Record<string, AuthorRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q;
      if (kind === "product" && productId) {
        q = supabase
          .from("product_reviews")
          .select("id, user_id, rating, title, body, created_at, vendor_response, vendor_responded_at")
          .eq("product_id", productId)
          .eq("status", "approved")
          .order("created_at", { ascending: false });
      } else if (kind === "vendor" && companyId) {
        q = supabase
          .from("vendor_reviews")
          .select("id, user_id, rating, body, created_at, vendor_response, vendor_responded_at")
          .eq("company_id", companyId)
          .eq("status", "approved")
          .order("created_at", { ascending: false });
      } else {
        setReviews([]);
        setLoading(false);
        return;
      }

      const { data } = await q;
      if (!alive) return;
      const list = (data ?? []) as ReviewRow[];
      setReviews(list);

      // Load author profiles (best-effort; RLS may hide some)
      const ids = Array.from(new Set(list.map((r) => r.user_id)));
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);
        const map: Record<string, AuthorRow> = {};
        (profiles ?? []).forEach((p) => {
          map[p.id] = p as AuthorRow;
        });
        if (alive) setAuthors(map);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [kind, productId, companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">لا توجد مراجعات بعد.</p>
      </Card>
    );
  }

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <div className="space-y-3">
      {showSummary && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="text-center">
            <p className="text-2xl font-bold">{avg.toFixed(1)}</p>
            <StarRating value={avg} readOnly size="sm" />
          </div>
          <div className="text-xs text-muted-foreground">
            بناءً على{" "}
            <span className="font-semibold text-foreground">{reviews.length}</span>{" "}
            مراجعة
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {reviews.map((r) => {
          const author = authors[r.user_id];
          const name = author?.full_name?.trim() || "عميل";
          return (
            <li key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{name}</p>
                    <StarRating value={r.rating} readOnly size="sm" />
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateAr(r.created_at)}
                    </span>
                  </div>
                  {"title" in r && r.title && (
                    <p className="mt-1 text-sm font-medium">{r.title}</p>
                  )}
                  {r.body && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {r.body}
                    </p>
                  )}
                  {r.vendor_response && (
                    <div className="mt-3 rounded-md border-r-2 border-primary bg-primary/5 p-2 text-xs">
                      <p className="font-semibold text-primary">رد المورد</p>
                      <p className="mt-1 whitespace-pre-line text-muted-foreground">
                        {r.vendor_response}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
