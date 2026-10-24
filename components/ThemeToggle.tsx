"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

/** Toggles <html class="dark"> and remembers the choice. Dark is the default. */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  // Sync with the class set by the pre-paint script in <head>.
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      /* storage disabled — theme still applies for this page view */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label="Dark theme"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      data-testid="theme-toggle"
      className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50"
    >
      <span aria-hidden="true">{dark ? "☀ Light" : "☾ Dark"}</span>
    </button>
  );
}
