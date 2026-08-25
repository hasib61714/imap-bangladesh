import { useState, useEffect, useCallback } from "react";

/**
 * Keep a single "page" navigation state in sync with the URL hash so pages are
 * deep-linkable (#wallet, #bookings, …) and the browser Back/Forward buttons
 * work — WITHOUT restructuring the app into a full component router. Hash-based
 * routing needs no server rewrites, which suits the GitHub Pages sub-path
 * deploy. `setPage` keeps the exact same call signature as a useState setter,
 * so existing `setPage("services")` call-sites are unchanged.
 *
 * @param {string}   defaultPage  page shown when the hash is empty/unknown
 * @param {string[]} [valid]      allow-list; unknown hashes fall back to default
 */
export function usePageRoute(defaultPage = "home", valid = null) {
  const read = useCallback(() => {
    const h = (window.location.hash || "").replace(/^#/, "").trim();
    if (!h) return defaultPage;
    if (valid && !valid.includes(h)) return defaultPage;
    return h;
  }, [defaultPage, valid]);

  const [page, setPageState] = useState(read);

  // state → URL
  const setPage = useCallback((next) => {
    setPageState((prev) => {
      const p = typeof next === "function" ? next(prev) : next;
      if (p && `#${p}` !== window.location.hash) {
        window.history.pushState(null, "", `#${p}`);
      }
      return p;
    });
  }, []);

  // URL (back/forward, manual edit) → state
  useEffect(() => {
    const onNav = () => setPageState(read());
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
    };
  }, [read]);

  return [page, setPage];
}
