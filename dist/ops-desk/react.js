"use client";
import { useCallback, useEffect, useRef, useState } from "react";
/**
 * A desk view addressed by the URL fragment. Navigating pushes one history entry per distinct
 * fragment, so Back and Forward, a reload and a shared link all restore the same view; the saved
 * state carries choices the fragment leaves out (an inactive tab's mode) for this session only.
 */
export function useFragmentView({ initial, read, write, historyKey }) {
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
    const navigate = useCallback((next) => {
        const { pathname, search, hash } = window.location;
        const nextHash = handlers.current.write(next);
        if (nextHash === hash)
            return;
        window.history.pushState({ [historyKey]: next }, "", pathname + search + nextHash);
        setView(next);
    }, [historyKey]);
    return { view, navigate };
}
//# sourceMappingURL=react.js.map