
CREATE OR REPLACE FUNCTION public.get_email_by_sgc(_sgc text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE sgc_id = _sgc LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_sgc(text) TO anon, authenticated;
