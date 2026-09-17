"use client";

// The day / night switch.
//
// The theme lives in one place: a data-theme attribute on <html>. This button
// flips it and remembers the choice in localStorage; the small script in
// app/layout.tsx applies it again on the next visit before anything paints, so
// there is never a flash of the wrong theme.
//
// Deliberately holds NO React state. Which icon shows is decided by CSS from
// the same data-theme attribute (see .rc-icon-sun / .rc-icon-moon in
// globals.css), so the button cannot disagree with the page it is sitting on,
// and there is nothing to hydrate.

const STORAGE_KEY = "reading-coach-theme";

export default function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;

    // Private browsing can refuse storage; the theme should still switch.
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not worth telling a child about.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rc-theme-toggle grid h-12 w-12 place-items-center text-2xl"
      aria-label="Switch between day and night colors"
      title="Day / night"
    >
      {/* Shows the theme you would switch TO. */}
      <span className="rc-icon-moon" aria-hidden="true">
        🌙
      </span>
      <span className="rc-icon-sun" aria-hidden="true">
        ☀️
      </span>
    </button>
  );
}
