import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, MessageSquare, PencilLine, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  author_name: string | null;
  author_avatar_url: string | null;
}

interface DistEntry {
  star: number;
  count: number;
  pct: number;
}

interface SummaryShape {
  count: number;
  avg: number;
  distribution: DistEntry[];
}

const PAGE_SIZE = 10;
const STALE_TIME = 60_000; // 60s — reviews don't change frequently

const EMPTY_SUMMARY: SummaryShape = {
  count: 0,
  avg: 0,
  distribution: [5, 4, 3, 2, 1].map((s) => ({ star: s, count: 0, pct: 0 })),
};

function normalizeSummary(raw: unknown): SummaryShape {
  if (!raw || typeof raw !== "object") return EMPTY_SUMMARY;
  const r = raw as { count?: number; avg?: number | string; distribution?: DistEntry[] };
  const dist = (r.distribution ?? []).map((d) => ({
    star: Number(d.star),
    count: Number(d.count),
    pct: Number(d.pct),
  }));
  const byStar = new Map(dist.map((d) => [d.star, d]));
  const full = [5, 4, 3, 2, 1].map(
    (s) => byStar.get(s) ?? { star: s, count: 0, pct: 0 },
  );
  return {
    count: Number(r.count ?? 0),
    avg: Number(r.avg ?? 0),
    distribution: full,
  };
}

// Query key factory for cache management
const reviewsKeys = {
  all: ["product-reviews"] as const,
  summary: (productId: string) =>
    [...reviewsKeys.all, "summary", productId] as const,
  list: (productId: string, sort: "newest" | "highest") =>
    [...reviewsKeys.all, "list", productId, sort] as const,
};

async function fetchSummary(productId: string): Promise<SummaryShape> {
  const { data, error } = await supabase.rpc("product_reviews_summary", {
    _product_id: productId,
  });
  if (error) throw error;
  return normalizeSummary(data);
}

async function fetchReviewsPage(
  productId: string,
  sort: "newest" | "highest",
  cursor: ReviewRow | null,
): Promise<ReviewRow[]> {
  const { data, error } = await supabase.rpc("product_reviews_page", {
    _product_id: productId,
    _sort: sort,
    _limit: PAGE_SIZE,
    ...(cursor
      ? {
          _cursor_created_at: cursor.created_at,
          _cursor_id: cursor.id,
          _cursor_rating: cursor.rating,
        }
      : {}),
  });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}

export const ProductReviewsSection = memo(function ProductReviewsSection({
  productId,
  productName,
  companyId,
  companyName,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<"newest" | "highest">("newest");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Summary query — cached separately, fetched once per productId
  const summaryQuery = useQuery({
    queryKey: reviewsKeys.summary(productId),
    queryFn: () => fetchSummary(productId),
    staleTime: STALE_TIME,
  });

  // Reviews list — infinite query with cursor pagination, keyed on sort
  const listQuery = useInfiniteQuery({
    queryKey: reviewsKeys.list(productId, sort),
    queryFn: ({ pageParam }) => fetchReviewsPage(productId, sort, pageParam),
    initialPageParam: null as ReviewRow | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === PAGE_SIZE ? lastPage[lastPage.length - 1] : undefined,
    staleTime: STALE_TIME,
  });

  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const reviews = useMemo(
    () => listQuery.data?.pages.flat() ?? [],
    [listQuery.data],
  );
  const loading = summaryQuery.isLoading || listQuery.isLoading;

  // Bonus: Prefetch the next page in the background once the first page settles
  useEffect(() => {
    if (
      listQuery.hasNextPage &&
      !listQuery.isFetchingNextPage &&
      listQuery.data?.pages.length === 1
    ) {
      void listQuery.fetchNextPage();
    }
  }, [listQuery]);

  const refreshAfterSubmit = useCallback(() => {
    // Invalidate both summary and list so they refetch fresh data
    void queryClient.invalidateQueries({
      queryKey: [...reviewsKeys.all, "summary", productId],
    });
    void queryClient.invalidateQueries({
      queryKey: [...reviewsKeys.all, "list", productId],
    });
  }, [queryClient, productId]);

  const alreadyReviewed = useMemo(
    () => !!user && reviews.some((r) => r.user_id === user.id),
    [reviews, user],
  );

  const writeBtnTitle = !user
    ? "سجّل الدخول لكتابة مراجعة"
    : alreadyReviewed
      ? "لقد قمت بمراجعة هذا المنتج بالفعل"
      : undefined;

  return (
    <section className="mt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">التقييمات والمراجعات</h2>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          disabled={!user || alreadyReviewed}
          title={writeBtnTitle}
          className="gap-1.5"
        >
          <PencilLine className="h-4 w-4" />
          {alreadyReviewed ? "تمت مراجعتك" : "اكتب مراجعة"}
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
              {summary.distribution.map((d) => (
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
                    {d.count}
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

      {/* List skeleton */}
      {loading && (
        <ul className="space-y-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* List */}
      {!loading && summary.count > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const name = r.author_name?.trim() || "عميل";
            const avatarUrl = r.author_avatar_url ?? undefined;
            return (
              <li key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                          <ShieldCheck className="h-3 w-3" />
                          تم الشراء
                        </span>
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

      {listQuery.hasNextPage && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void listQuery.fetchNextPage()}
            disabled={listQuery.isFetchingNextPage}
            className="gap-2"
          >
            {listQuery.isFetchingNextPage && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
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
        onSubmitted={refreshAfterSubmit}
      />
    </section>
  );
});
