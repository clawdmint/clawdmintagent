"use client";

import { useTheme } from "./theme-provider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-10 h-10 rounded-xl glass flex items-center justify-center hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-black/5 transition-all group"
      aria-label="Toggle theme"
    >
      <Sun className={`w-5 h-5 absolute transition-all duration-300 ${
        theme === "dark" 
          ? "opacity-0 rotate-90 scale-0" 
          : "opacity-100 rotate-0 scale-100 text-amber-500"
      }`} />
      <Moon className={`w-5 h-5 absolute transition-all duration-300 ${
        theme === "light" 
          ? "opacity-0 -rotate-90 scale-0" 
          : "opacity-100 rotate-0 scale-100 text-cyan-400"
      }`} />
    </button>
  );
}
