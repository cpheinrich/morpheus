"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FragmentViewOptions<V> = {
  /** The view before the browser's fragment has been read (server render and first paint). */
  initial: V;
  /** Restore a view from `location.hash`, given what this page saved in `history.state`. */
  read: (hash: string, saved: V | undefined) => V;
  /** The fragment for a view; `""` for the default view. */
  write: (view: V) => string;
  /** The `history.state` key that holds this page's view. */
  historyKey: string;
};

/**
 * A desk view addressed by the URL fragment. Navigating pushes one history entry per distinct
 * fragment, so Back and Forward, a reload and a shared link all restore the same view; the saved
 * state carries choices the fragment leaves out (an inactive tab's mode) for this session only.
 */
export function useFragmentView<V>({ initial, read, write, historyKey }: FragmentViewOptions<V>) {
  const [view, setView] = useState(initial);
  const handlers = useRef({ read, write });
  handlers.current = { read, write };

  useEffect(() => {
    const restore = () => setView(handlers.current.read(window.location.hash, window.history.state?.[historyKey]));
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [historyKey]);

  const navigate = useCallback((next: V) => {
    const { pathname, search, hash } = window.location;
    const nextHash = handlers.current.write(next);
    if (nextHash === hash) return;
    window.history.pushState({ [historyKey]: next }, "", pathname + search + nextHash);
    setView(next);
  }, [historyKey]);

  return { view, navigate };
}
