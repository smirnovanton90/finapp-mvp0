"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { INK } from "@/lib/colors";

function SunIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 2v2.5M12 19.5V22M4.22 4.22 6 6M18 18l1.78 1.78M2 12h2.5M19.5 12H22M4.22 19.78 6 18M18 6l1.78-1.78"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3a6.5 6.5 0 1 0 11.5 11.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggleFab() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const baseBg = isDark ? "rgba(108, 93, 215, 0.22)" : "rgba(108, 93, 215, 0.12)";
  const hoverBg = isDark ? "rgba(108, 93, 215, 0.4)" : "rgba(108, 93, 215, 0.18)";
  const iconColor = isDark ? "#FFFFFF" : INK;

  return (
    <div className="fixed right-6 bottom-6 z-50">
      <Button
        type="button"
        aria-label={isDark ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
        className="text-foreground h-12 w-12 border-0 rounded-lg relative flex items-center justify-center p-0"
        style={{
          backgroundColor: baseBg,
          color: iconColor,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = hoverBg;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = baseBg;
        }}
        onClick={toggleTheme}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </Button>
    </div>
  );
}

