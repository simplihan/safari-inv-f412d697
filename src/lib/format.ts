export function fmtDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function liveDuration(outIso: string) {
  const ms = Date.now() - new Date(outIso).getTime();
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  if (min < 60) return `${min}m ${sec.toString().padStart(2, "0")}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m ${sec.toString().padStart(2, "0")}s`;
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function reasonLabel(reason?: string | null) {
  if (reason === "Break") return "Tea Break";
  return reason ?? "—";
}

export function toDbReason(label: string) {
  if (label === "Tea Break") return "Break";
  return label;
}