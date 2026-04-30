-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reviews_product_status
  ON public.product_reviews(product_id, status);

CREATE INDEX IF NOT EXISTS idx_reviews_product_status_created
  ON public.product_reviews(product_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_product_status_rating
  ON public.product_reviews(product_id, status, rating DESC, created_at DESC, id DESC);

-- Summary RPC: avg, count, distribution in a single roundtrip
CREATE OR REPLACE FUNCTION public.product_reviews_summary(_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH approved AS (
    SELECT rating
    FROM public.product_reviews
    WHERE product_id = _product_id
      AND status = 'approved'
  ),
  agg AS (
    SELECT
      COUNT(*)::int AS count,
      COALESCE(AVG(rating), 0)::numeric(10,2) AS avg
    FROM approved
  ),
  dist AS (
    SELECT s AS star,
      (SELECT COUNT(*) FROM approved WHERE ROUND(rating)::int = s)::int AS n
    FROM generate_series(1, 5) s
  )
  SELECT jsonb_build_object(
    'count', (SELECT count FROM agg),
    'avg',   (SELECT avg   FROM agg),
    'distribution', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'star', star,
          'count', n,
          'pct', CASE WHEN (SELECT count FROM agg) = 0
                      THEN 0
                      ELSE ROUND((n::numeric / (SELECT count FROM agg)) * 100, 1)
                 END
        )
        ORDER BY star DESC
      )
      FROM dist
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.product_reviews_summary(uuid) TO anon, authenticated;

-- Cursor-based paginated reviews with author info embedded
CREATE OR REPLACE FUNCTION public.product_reviews_page(
  _product_id uuid,
  _sort text DEFAULT 'newest',  -- 'newest' | 'highest'
  _limit int DEFAULT 10,
  _cursor_created_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _cursor_rating int DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  rating int,
  title text,
  body text,
  created_at timestamptz,
  order_id uuid,
  user_id uuid,
  author_name text,
  author_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.rating, r.title, r.body, r.created_at, r.order_id, r.user_id,
    p.full_name AS author_name,
    p.avatar_url AS author_avatar_url
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.product_id = _product_id
    AND r.status = 'approved'
    AND (
      _sort = 'newest' AND (
        _cursor_created_at IS NULL
        OR (r.created_at, r.id) < (_cursor_created_at, _cursor_id)
      )
      OR
      _sort = 'highest' AND (
        _cursor_rating IS NULL
        OR (r.rating, r.created_at, r.id) < (_cursor_rating, _cursor_created_at, _cursor_id)
      )
    )
  ORDER BY
    CASE WHEN _sort = 'highest' THEN r.rating END DESC NULLS LAST,
    r.created_at DESC,
    r.id DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.product_reviews_page(uuid, text, int, timestamptz, uuid, int) TO anon, authenticated;