import { useSyncExternalStore } from "react";

// the same width the stylesheet switches to the phone layout at (client.css, "phones")
const QUERY = "(max-width: 640px)";

function subscribe(listener: () => void) {
    const query = window.matchMedia?.(QUERY);
    query?.addEventListener("change", listener);
    return () => query?.removeEventListener("change", listener);
}

/**
 * Whether the screen is a phone's. The signed-in app then has its phone header and bottom bar, and the client portal
 * shows one section at a time. A browser without media queries (a test's jsdom) is never a phone.
 */
export function useIsPhone(): boolean {
    return useSyncExternalStore(subscribe, () => window.matchMedia?.(QUERY).matches ?? false);
}
