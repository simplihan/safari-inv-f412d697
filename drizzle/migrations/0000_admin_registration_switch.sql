CREATE TABLE public.registration_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.registration_settings TO anon, authenticated;
GRANT ALL ON public.registration_settings TO service_role;
ALTER TABLE public.registration_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public registration status" ON public.registration_settings FOR SELECT TO anon, authenticated USING (true);

CREATE FUNCTION public.get_registration_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT enabled FROM public.registration_settings WHERE id = true), true); $$;
REVOKE ALL ON FUNCTION public.get_registration_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registration_enabled() TO anon, authenticated, service_role;

CREATE FUNCTION public.set_registration_enabled(_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can change registration access.' USING ERRCODE = '42501';
  END IF;
  IF _enabled IS NULL THEN RAISE EXCEPTION 'Registration status is required.'; END IF;
  INSERT INTO public.registration_settings (id, enabled) VALUES (true, _enabled)
    ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled;
  RETURN _enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.set_registration_enabled(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_registration_enabled(boolean) TO authenticated;

CREATE FUNCTION public.guard_new_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.get_registration_enabled() THEN
    RAISE EXCEPTION 'New access requests are currently paused. Please contact your administrator.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_new_registration() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_new_registration BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.guard_new_registration();