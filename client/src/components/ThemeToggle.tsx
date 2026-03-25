import { Monitor, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { cn } from "./ui";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolvedMode = theme === "system"
    ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  const cycleOrder = ["light", "dark", "system"] as const;
  const nextTheme = cycleOrder[(cycleOrder.indexOf(theme) + 1) % cycleOrder.length];

  const icon = useMemo(() => {
    if (theme === "system") {
      return <Monitor className="h-4 w-4 text-muted-foreground" />;
    }

    return theme === "dark"
      ? <MoonStar className="h-4 w-4 text-primary" />
      : <SunMedium className="h-4 w-4 text-warning" />;
  }, [theme]);

  const label = theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light";

  if (!mounted) {
    return <div className={cn("h-10 w-10 rounded-full border border-border bg-surface opacity-50", className)} />;
  }

  const toggleTheme = () => {
    setTheme(nextTheme);
  };

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface/90 px-3 text-sm text-contrast shadow-soft hover:border-primary/25 hover:bg-surface",
        className,
      )}
      aria-label="Toggle theme"
      title={theme === "system" ? "Theme: system" : `Theme: ${theme}`}
    >
      <motion.span
        key={`${theme}-${resolvedMode}`}
        initial={{ opacity: 0, y: 4, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="flex items-center"
      >
        {icon}
      </motion.span>
      <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:inline">
        {label}
      </span>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
