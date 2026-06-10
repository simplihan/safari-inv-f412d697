SELECT cron.unschedule('monthly-department-reports')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-department-reports');

SELECT cron.schedule(
  'monthly-department-reports',
  '0 8 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://project--e3385a8f-325b-48ff-beb8-006d331f2aa2.lovable.app/api/public/hooks/monthly-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.unschedule('process-email-queue')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue');

SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
      THEN NULL
    WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
      THEN net.http_post(
        url := 'https://id-preview--e3385a8f-325b-48ff-beb8-006d331f2aa2.lovable.app/lovable/email/queue/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
            LIMIT 1
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END;
  $$
);