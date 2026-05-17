-- S2.3.b — Revoke EXECUTE from anon on SECURITY DEFINER functions
-- Whitelist (kept executable by anon): public signup + public product review reads.

DO $$
DECLARE
  r record;
  sig text;
  whitelist text[] := ARRAY[
    'public_signup_company(text,text,text,text,text,text)',
    'product_reviews_page(uuid,text,integer,timestamp with time zone,uuid,integer)',
    'product_reviews_page(uuid,text,integer,timestamp with time zone,uuid,integer,integer,integer)',
    'product_reviews_summary(uuid)',
    'product_trust_signals(uuid)'
  ];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    sig := r.proname || '(' || r.args || ')';
    IF NOT (sig = ANY (whitelist)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;',
                     r.proname, r.args);
    END IF;
  END LOOP;
END $$;