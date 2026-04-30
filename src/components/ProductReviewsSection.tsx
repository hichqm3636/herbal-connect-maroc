import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, PencilLine, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/StarRating";
import { ReviewDialog } from "@/components/ReviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateAr } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  productId: string;
  productName: string;
  companyId: string;
  companyName: string;
}

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
  order_id: string | null;
  user_id: string;
}

interface AuthorRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const PAGE_SIZE = 10;

export function ProductReviewsSection({
  productId,
  productName,
  companyId,
  companyName,
}: Props) {
  const { user } = useAuth();

  const [allRatings, setAllRatings] = useState<number[] | null>(null); // for summary
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sort, setSort] = useState<"newest" | "highest">("newest");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load summary + first page
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setReviews([]);
    setAuthors({});

    (async () => {
      // Summary
      const { data: ratings } = await supabase
        .from("product_reviews")
        .select("rating")
        .eq("product_id", productId)
        .eq("status", "approved");

      if (!alive) return;
      setAllRatings((ratings ?? []).map((r) => r.rating as number));

      // First page
      let q = supabase
        .from("product_reviews")
        .select("id, rating, title, body, created_at, order_id, user_id")
        .eq("product_id", productId)
        .eq("status", "approved");
      q =
        sort === "newest"
          ? q.order("created_at", { ascending: false })
          : q.order("rating", { ascending: false }).order("created_at", { ascending: false });
      const { data } = await q.range(0, PAGE_SIZE - 1);

      if (!alive) return;
      const list = (data ?? []) as ReviewRow[];
      setReviews(list);
      setHasMore(list.length === PAGE_SIZE);

      await loadAuthors(list, alive);
      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, sort, refreshKey]);

  const loadAuthors = async (list: ReviewRow[], alive = true) => {
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (!ids.length) return;
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", ids);
    if (!alive) return;
    setAuthors((prev) => {
      const next = { ...prev };
      (profiles ?? []).forEach((p) => {
        next[p.id] = p as AuthorRow;
      });
      return next;
    });
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const from = reviews.length;
    let q = supabase
      .from("product_reviews")
      .select("id, rating, title, body, created_at, order_id, user_id")
      .eq("product_id", productId)
      .eq("status", "approved");
    q =
      sort === "newest"
        ? q.order("created_at", { ascending: false })
        : q.order("rating", { ascending: false }).order("created_at", { ascending: false });
    const { data } = await q.range(from, from + PAGE_SIZE - 1);
    const list = (data ?? []) as ReviewRow[];
    setReviews((prev) => [...prev, ...list]);
    setHasMore(list.length === PAGE_SIZE);
    await loadAuthors(list);
    setLoadingMore(false);
  };

  const summary = useMemo(() => {
    const ratings = allRatings ?? [];
    const count = ratings.length;
    const avg = count === 0 ? 0 : ratings.reduce((s, r) => s + r, 0) / count;
    const dist = [5, 4, 3, 2, 1].map((star) => {
      const n = ratings.filter((r) => Math.round(r) === star).length;
      const pct = count === 0 ? 0 : (n / count) * 100;
      return { star, n, pct };
    });
    return { count, avg, dist };
  }, [allRatings]);

  return (
    <section className="mt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">التقييمات والمراجعات</h2>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          disabled={!user}
          title={!user ? "سجّل الدخول لكتابة مراجعة" : undefined}
          className="gap-1.5"
        >
          <PencilLine className="h-4 w-4" />
          اكتب مراجعة
        </Button>
      </div>

      {/* Summary */}
      {loading ? (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-20" />
            <div className="flex-1 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-3 w-full" />
              ))}
            </div>
          </div>
        </Card>
      ) : summary.count === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <MessageSquare className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">لا توجد مراجعات بعد</p>
          <p className="text-xs text-muted-foreground">
            كن أول من يشارك تجربته مع هذا المنتج.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex shrink-0 flex-col items-center gap-1 sm:w-32">
              <p className="text-4xl font-extrabold tabular-nums">
                {summary.avg.toFixed(1)}
              </p>
              <StarRating value={summary.avg} readOnly size="md" />
              <p className="text-xs text-muted-foreground">
                {summary.count} مراجعة
              </p>
            </div>
            <div className="flex-1 space-y-1.5">
              {summary.dist.map((d) => (
                <div key={d.star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 tabular-nums">{d.star}</span>
                  <span className="text-yellow-400">★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-yellow-400 transition-all"
                      style={{ width: `${d.pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-left tabular-nums text-muted-foreground">
                    {d.n}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Sort */}
      {summary.count > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">ترتيب:</span>
          <button
            onClick={() => setSort("newest")}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              sort === "newest"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            الأحدث
          </button>
          <button
            onClick={() => setSort("highest")}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              sort === "highest"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            الأعلى تقييماً
          </button>
        </div>
      )}

      {/* List */}
      {!loading && summary.count > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const author = authors[r.user_id];
            const name = author?.full_name?.trim() || "عميل";
            return (
              <li key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    {author?.avatar_url && (
                      <AvatarImage src={author.avatar_url} alt={name} />
                    )}
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
                      {r.order_id && (
                        <Badge
                          variant="secondary"
                          className="gap-1 bg-success/10 text-success"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          تم الشراء
                        </Badge>
                      )}
                    </div>
                    {r.title && (
                      <p className="mt-1 text-sm font-medium">{r.title}</p>
                    )}
                    {r.body && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {r.body}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            عرض المزيد
          </Button>
        </div>
      )}

      <ReviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind="product"
        productId={productId}
        productName={productName}
        companyId={companyId}
        companyName={companyName}
        onSubmitted={() => setRefreshKey((k) => k + 1)}
      />
    </section>
  );
}
