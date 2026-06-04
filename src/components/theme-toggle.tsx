import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className={`w-full justify-start gap-2 transition-colors ${
        isDark
          ? "bg-yellow-100 text-yellow-900 border-yellow-300 hover:bg-yellow-200 hover:text-yellow-900"
          : "bg-slate-900 text-slate-100 border-slate-700 hover:bg-slate-800 hover:text-white"
      }`}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <Sun
          className={`absolute h-4 w-4 transition-all duration-300 ${
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
        />
        <Moon
          className={`absolute h-4 w-4 transition-all duration-300 ${
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          }`}
        />
      </span>
      {isDark ? "Light mode" : "Dark mode"}
    </Button>
  );
}