import { IN, NP, PH, QA } from "country-flag-icons/react/3x2";

const FLAG_COMPONENTS: Record<string, React.ComponentType<{ title?: string; className?: string }>> = {
  India: IN,
  Nepal: NP,
  Philippines: PH,
  Qatar: QA,
};

/** Renders a real SVG country flag (not an emoji) for supported countries. */
export function CountryFlag({
  country,
  fallback = "🎉",
  className = "inline-block h-6 w-9 shrink-0 rounded-sm border border-border object-cover align-middle shadow-sm",
}: {
  country: string;
  fallback?: string;
  className?: string;
}) {
  const Flag = FLAG_COMPONENTS[country];
  if (!Flag) return <span aria-label={`${country} flag`}>{fallback}</span>;
  return <Flag title={`${country} flag`} className={className} />;
}

/** True when the festival name indicates a national-day / independence-day celebration. */
export function isNationalDay(name: string): boolean {
  return /independence day|national day/i.test(name);
}
