
-- ========= ENUMS =========
CREATE TYPE public.app_role AS ENUM ('admin','manager','staff');
CREATE TYPE public.user_status AS ENUM ('pending','approved','rejected');
CREATE TYPE public.break_reason AS ENUM ('Break','Lunch','Prayer','Shopping','Meeting','Other');

-- ========= PROFILES =========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sgc_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT,
  department TEXT,
  status public.user_status NOT NULL DEFAULT 'pending',
  profile_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========= USER ROLES =========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ========= BREAK LOGS =========
CREATE TABLE public.break_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason public.break_reason NOT NULL,
  remarks TEXT,
  out_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  in_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'out', -- 'out' or 'in'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_break_logs_user ON public.break_logs(user_id);
CREATE INDEX idx_break_logs_status ON public.break_logs(status);
CREATE INDEX idx_break_logs_out_time ON public.break_logs(out_time DESC);

-- ========= ROLE HELPER =========
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'));
$$;

-- ========= AUTO-CREATE PROFILE ON SIGNUP =========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, sgc_id, mobile, department, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'sgc_id',
    NEW.raw_user_meta_data->>'mobile',
    NEW.raw_user_meta_data->>'department',
    'pending'
  );
  -- default role: staff (gives them something to be once approved)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========= UPDATED_AT TRIGGER =========
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========= RLS =========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "update own limited profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "managers update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- break_logs
CREATE POLICY "view own breaks" ON public.break_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "create own break" ON public.break_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update own open break" ON public.break_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin update break" ON public.break_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin delete break" ON public.break_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ========= REALTIME =========
ALTER PUBLICATION supabase_realtime ADD TABLE public.break_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
