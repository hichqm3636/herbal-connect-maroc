CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior versions to keep this idempotent
SELECT cron.unschedule('send-whatsapp-5min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-whatsapp-5min');
SELECT cron.unschedule('cleanup-whatsapp-outbox')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-whatsapp-outbox');

SELECT cron.schedule(
  'send-whatsapp-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jarlejsbrxtrusfjklkg.supabase.co/functions/v1/send-whatsapp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcmxlanNicnh0cnVzZmprbGtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MDg3OTcsImV4cCI6MjA5MTk4NDc5N30.XWwHK6TPovkwNMAuCfLuNBi2mhxA2WZc7KXR6tj3US8'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'cleanup-whatsapp-outbox',
  '0 2 * * *',
  $$
  DELETE FROM public.whatsapp_outbox
  WHERE created_at < now() - interval '7 days'
    AND status IN ('sent','failed');
  $$
);