CREATE OR REPLACE FUNCTION public.analytics_ab_results(_days int DEFAULT 30)
RETURNS TABLE(
  experiment text,
  variant text,
  assignments bigint,
  conversions bigint,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT event_name, metadata, created_at
    FROM public.analytics_events
    WHERE created_at >= now() - make_interval(days => _days)
  ),
  assigns AS (
    SELECT
      COALESCE(metadata->>'experiment', 'unknown') AS experiment,
      COALESCE(metadata->>'variant', 'unknown') AS variant,
      COUNT(*) AS assignments
    FROM e
    WHERE event_name = 'ab_assignment'
    GROUP BY 1, 2
  ),
  -- Conversions: any cta_label variant attached to checkout_completed events.
  -- We focus on cta_label because that's what's stored at conversion time.
  conv AS (
    SELECT
      'cta_label'::text AS experiment,
      COALESCE(metadata->>'variant', 'unknown') AS variant,
      COUNT(*) AS conversions
    FROM e
    WHERE event_name = 'checkout_completed'
      AND metadata ? 'variant'
      AND COALESCE(metadata->>'variant', '') <> ''
    GROUP BY 2
  )
  SELECT
    a.experiment,
    a.variant,
    a.assignments,
    COALESCE(c.conversions, 0) AS conversions,
    CASE
      WHEN a.assignments > 0
      THEN ROUND((COALESCE(c.conversions, 0)::numeric / a.assignments::numeric) * 100, 2)
      ELSE 0
    END AS conversion_rate
  FROM assigns a
  LEFT JOIN conv c
    ON c.experiment = a.experiment
   AND c.variant = a.variant
  ORDER BY a.experiment, a.variant;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_ab_results(int) TO authenticated;