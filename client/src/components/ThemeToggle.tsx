import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={`w-9 h-9 rounded-full border border-border bg-surface ${className} opacity-50`} />;
  }

  const toggleTheme = () => {
    // Cycle logic: If System, resolve to explicit. Otherwise toggle.
    // Simple UX: If it looks dark, make it light. If it looks light, make it dark.
    if (theme === 'system') {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(isSystemDark ? 'light' : 'dark');
    } else {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };

  // Determine if we are visually in dark mode for the icon state
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <button
      onClick={toggleTheme}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      aria-label="Toggle theme"
    >
      <motion.div
        initial={false}
        animate={{
          scale: isDark ? 0 : 1,
          rotate: isDark ? 90 : 0,
          opacity: isDark ? 0 : 1
        }}
        transition={{ duration: 0.2 }}
        className="absolute"
      >
        <Sun className="h-5 w-5 text-amber-500" />
      </motion.div>
      
      <motion.div
        initial={false}
        animate={{
          scale: isDark ? 1 : 0,
          rotate: isDark ? 0 : -90,
          opacity: isDark ? 1 : 0
        }}
        transition={{ duration: 0.2 }}
        className="absolute"
      >
        <Moon className="h-4 w-4 text-blue-400" />
      </motion.div>
      
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}