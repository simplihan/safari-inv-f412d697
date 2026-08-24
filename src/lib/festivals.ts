export type Festival = {
  id: string;
  name: string;
  country: "India" | "Nepal" | "Philippines" | "Qatar";
  flag: string;
  emoji: string;
  greeting: string;
  /** ISO date (YYYY-MM-DD). Lunar/variable festivals are listed per year. */
  dates: string[];
};

/**
 * Major festivals/holidays celebrated by the team.
 * Fixed-date events repeat every year via MM-DD entries handled in matching.
 */
export const FESTIVALS: Festival[] = [
  // India
  {
    id: "in-diwali",
    name: "Diwali",
    country: "India",
    flag: "🇮🇳",
    emoji: "🪔",
    greeting: "Happy Diwali! May the festival of lights bring joy and prosperity.",
    dates: ["2026-11-08", "2027-10-29"],
  },
  {
    id: "in-holi",
    name: "Holi",
    country: "India",
    flag: "🇮🇳",
    emoji: "🎨",
    greeting: "Happy Holi! Wishing you a colourful and joyful celebration.",
    dates: ["2026-03-04", "2027-03-22"],
  },
  {
    id: "in-ganesh",
    name: "Ganesh Chaturthi",
    country: "India",
    flag: "🇮🇳",
    emoji: "🐘",
    greeting: "Happy Ganesh Chaturthi! Wishing you wisdom and new beginnings.",
    dates: ["2026-09-14", "2027-09-04"],
  },
  {
    id: "in-independence",
    name: "Indian Independence Day",
    country: "India",
    flag: "🇮🇳",
    emoji: "🎆",
    greeting: "Happy Independence Day to all our Indian colleagues!",
    dates: ["08-15"],
  },
  // Nepal
  {
    id: "np-dashain",
    name: "Dashain",
    country: "Nepal",
    flag: "🇳🇵",
    emoji: "🌾",
    greeting: "Happy Dashain! Wishing you blessings, victory and happiness.",
    dates: ["2026-10-21", "2027-10-10"],
  },
  {
    id: "np-tihar",
    name: "Tihar",
    country: "Nepal",
    flag: "🇳🇵",
    emoji: "🪔",
    greeting: "Happy Tihar! May the festival of lights brighten your home.",
    dates: ["2026-11-09", "2027-10-30"],
  },
  {
    id: "np-newyear",
    name: "Nepali New Year",
    country: "Nepal",
    flag: "🇳🇵",
    emoji: "🎊",
    greeting: "Naya Barsha ko Subhakamana! Happy Nepali New Year.",
    dates: ["04-14"],
  },
  // Philippines
  {
    id: "ph-christmas",
    name: "Christmas",
    country: "Philippines",
    flag: "🇵🇭",
    emoji: "🎄",
    greeting: "Maligayang Pasko! Merry Christmas to you and your family.",
    dates: ["12-25"],
  },
  {
    id: "ph-independence",
    name: "Philippine Independence Day",
    country: "Philippines",
    flag: "🇵🇭",
    emoji: "🎇",
    greeting: "Maligayang Araw ng Kalayaan! Happy Independence Day.",
    dates: ["06-12"],
  },
  {
    id: "ph-undas",
    name: "Undas (All Saints' Day)",
    country: "Philippines",
    flag: "🇵🇭",
    emoji: "🕯️",
    greeting: "Remembering loved ones this Undas.",
    dates: ["11-01"],
  },
  // Qatar
  {
    id: "qa-national",
    name: "Qatar National Day",
    country: "Qatar",
    flag: "🇶🇦",
    emoji: "🇶🇦",
    greeting: "Happy Qatar National Day! Celebrating the spirit of Qatar.",
    dates: ["12-18"],
  },
  {
    id: "qa-sports",
    name: "Qatar Sports Day",
    country: "Qatar",
    flag: "🇶🇦",
    emoji: "🏅",
    greeting: "Happy National Sports Day! Stay active and healthy.",
    dates: ["2026-02-10", "2027-02-09"],
  },
  // Shared (Islamic) celebrations
  {
    id: "eid-al-fitr",
    name: "Eid al-Fitr",
    country: "Qatar",
    flag: "🌙",
    emoji: "🌙",
    greeting: "Eid Mubarak! Wishing you peace, joy and blessings.",
    dates: ["2026-03-20", "2027-03-09"],
  },
  {
    id: "eid-al-adha",
    name: "Eid al-Adha",
    country: "Qatar",
    flag: "🌙",
    emoji: "🕌",
    greeting: "Eid Mubarak! May this Eid bring happiness to your family.",
    dates: ["2026-05-27", "2027-05-17"],
  },
  // Shared new year
  {
    id: "new-year",
    name: "New Year",
    country: "Qatar",
    flag: "🎉",
    emoji: "🎉",
    greeting: "Happy New Year! Wishing you a wonderful year ahead.",
    dates: ["01-01"],
  },
];

/** Festivals matching the given local date. */
export function festivalsOn(date: Date): Festival[] {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const md = `${mm}-${dd}`;
  const full = `${date.getFullYear()}-${md}`;
  return FESTIVALS.filter((f) => f.dates.includes(md) || f.dates.includes(full));
}
