CREATE TABLE public.festivals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL DEFAULT 'Other',
  flag text NOT NULL DEFAULT '🎉',
  emoji text NOT NULL DEFAULT '🎉',
  greeting text NOT NULL DEFAULT '',
  dates text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.festivals TO authenticated;
GRANT ALL ON public.festivals TO service_role;

ALTER TABLE public.festivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view festivals"
ON public.festivals FOR SELECT TO authenticated
USING (private.is_approved(auth.uid()));

CREATE POLICY "Admins can insert festivals"
ON public.festivals FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update festivals"
ON public.festivals FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete festivals"
ON public.festivals FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_festivals_updated_at
BEFORE UPDATE ON public.festivals
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.festivals (name, country, flag, emoji, greeting, dates) VALUES
('Diwali','India','🇮🇳','🪔','Happy Diwali! May the festival of lights bring joy and prosperity.','{2026-11-08,2027-10-29}'),
('Holi','India','🇮🇳','🎨','Happy Holi! Wishing you a colourful and joyful celebration.','{2026-03-04,2027-03-22}'),
('Ganesh Chaturthi','India','🇮🇳','🐘','Happy Ganesh Chaturthi! Wishing you wisdom and new beginnings.','{2026-09-14,2027-09-04}'),
('Indian Independence Day','India','🇮🇳','🎆','Happy Independence Day to all our Indian colleagues!','{08-15}'),
('Dashain','Nepal','🇳🇵','🌾','Happy Dashain! Wishing you blessings, victory and happiness.','{2026-10-21,2027-10-10}'),
('Tihar','Nepal','🇳🇵','🪔','Happy Tihar! May the festival of lights brighten your home.','{2026-11-09,2027-10-30}'),
('Nepali New Year','Nepal','🇳🇵','🎊','Naya Barsha ko Subhakamana! Happy Nepali New Year.','{04-14}'),
('Christmas','Philippines','🇵🇭','🎄','Maligayang Pasko! Merry Christmas to you and your family.','{12-25}'),
('Philippine Independence Day','Philippines','🇵🇭','🎇','Maligayang Araw ng Kalayaan! Happy Independence Day.','{06-12}'),
('Undas (All Saints'' Day)','Philippines','🇵🇭','🕯️','Remembering loved ones this Undas.','{11-01}'),
('Qatar National Day','Qatar','🇶🇦','🇶🇦','Happy Qatar National Day! Celebrating the spirit of Qatar.','{12-18}'),
('Qatar Sports Day','Qatar','🇶🇦','🏅','Happy National Sports Day! Stay active and healthy.','{2026-02-10,2027-02-09}'),
('Eid al-Fitr','Qatar','🌙','🌙','Eid Mubarak! Wishing you peace, joy and blessings.','{2026-03-20,2027-03-09}'),
('Eid al-Adha','Qatar','🌙','🕌','Eid Mubarak! May this Eid bring happiness to your family.','{2026-05-27,2027-05-17}'),
('New Year','Qatar','🎉','🎉','Happy New Year! Wishing you a wonderful year ahead.','{01-01}');