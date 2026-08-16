-- Unique guards (case/format insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_sgc_id_unique_ci
  ON public.profiles (lower(btrim(sgc_id)))
  WHERE sgc_id IS NOT NULL AND btrim(sgc_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_ci
  ON public.profiles (lower(btrim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_mobile_unique_digits
  ON public.profiles (regexp_replace(mobile, '\D', '', 'g'))
  WHERE mobile IS NOT NULL AND regexp_replace(mobile, '\D', '', 'g') <> '';

-- Public pre-check for the registration form
CREATE OR REPLACE FUNCTION public.registration_identity_taken(_sgc text, _mobile text)
RETURNS TABLE(sgc_taken boolean, mobile_taken boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(_sgc, '') <> '' AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(btrim(p.sgc_id)) = lower(btrim(_sgc))
    ),
    regexp_replace(COALESCE(_mobile, ''), '\D', '', 'g') <> '' AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE regexp_replace(COALESCE(p.mobile, ''), '\D', '', 'g')
            = regexp_replace(COALESCE(_mobile, ''), '\D', '', 'g')
    );
$$;

REVOKE ALL ON FUNCTION public.registration_identity_taken(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_identity_taken(text, text) TO anon, authenticated, service_role;

-- Sign-up trigger: fail loudly on duplicates instead of leaving a profile-less account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sgc text := NULLIF(btrim(NEW.raw_user_meta_data->>'sgc_id'), '');
  v_mobile text := NULLIF(btrim(NEW.raw_user_meta_data->>'mobile'), '');
BEGIN
  IF v_sgc IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(btrim(sgc_id)) = lower(v_sgc)
  ) THEN
    RAISE EXCEPTION 'This SGC ID is already registered.' USING ERRCODE = 'unique_violation';
  END IF;

  IF v_mobile IS NOT NULL AND regexp_replace(v_mobile, '\D', '', 'g') <> '' AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE regexp_replace(COALESCE(mobile, ''), '\D', '', 'g') = regexp_replace(v_mobile, '\D', '', 'g')
  ) THEN
    RAISE EXCEPTION 'This mobile number is already registered.' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, sgc_id, mobile, department, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    v_sgc,
    v_mobile,
    NEW.raw_user_meta_data->>'department',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff')
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user user_roles insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;