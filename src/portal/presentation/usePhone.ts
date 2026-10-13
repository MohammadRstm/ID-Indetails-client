import { useSyncExternalStore } from "react";

// the same width the stylesheet switches to the phone layout at
const QUERY = "(max-width: 640px)";

function subscribe(listener: () => void) {
    const query = window.matchMedia?.(QUERY);
    query?.addEventListener("change", listener);
    return () => query?.removeEventListener("change", listener);
}

/** Whether the screen is a phone's: the page then shows one section at a time. */
export function usePhone(): boolean {
    return useSyncExternalStore(subscribe, () => window.matchMedia?.(QUERY).matches ?? false);
}
