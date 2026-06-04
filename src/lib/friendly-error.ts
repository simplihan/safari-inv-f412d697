export function friendlyError(error: unknown): string {
  const e = error as { message?: string; code?: string } | null | undefined;
  if (!e) return "Something went wrong. Please try again.";
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();

  if (msg.includes("uniq_break_logs_one_open_per_user")) {
    return "Please stop your current activity before starting a new one.";
  }
  if (code === "23505" || msg.includes("duplicate key")) return "That value is already in use.";
  if (code === "23503") return "That change references something that no longer exists.";
  if (code === "23502") return "A required field is missing.";
  if (code === "23514" || msg.includes("check constraint")) return "That value isn't allowed.";
  if (code === "42501" || code === "insufficient_privilege" || msg.includes("not allowed") || msg.includes("permission")) {
    return "You don't have permission to do that.";
  }
  if (msg.includes("row-level security") || msg.includes("rls")) return "You don't have permission to do that.";
  if (msg.includes("jwt") || msg.includes("not authenticated")) return "Please sign in again.";
  if (msg.includes("network") || msg.includes("fetch")) return "Network error. Please check your connection.";

  // Log full detail for debugging, return generic message to user
  if (typeof console !== "undefined") console.error("[app error]", error);
  return "Something went wrong. Please try again.";
}