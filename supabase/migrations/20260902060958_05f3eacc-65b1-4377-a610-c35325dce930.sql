UPDATE public.festivals
SET emoji = flag, updated_at = now()
WHERE (name ILIKE '%independence%' OR name ILIKE '%national day%')
  AND flag IS NOT NULL AND flag <> '';