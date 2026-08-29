import { useSyncExternalStore } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function read(): "light" | "dark" {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * The colour scheme the operating system asks for.
 *
 * Every token in `index.css` already follows this media query on its own, and
 * there is no switcher to override it. This hook exists for the one surface
 * that cannot read CSS: BlockNote paints its editor from a `theme` prop.
 */
export function useColorScheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, read, () => "light");
}
