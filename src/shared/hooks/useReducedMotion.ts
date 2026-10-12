import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void) {
    const query = window.matchMedia?.(QUERY);
    query?.addEventListener("change", listener);
    return () => query?.removeEventListener("change", listener);
}

/** Whether the person asked their system for less motion: animations driven from script must stop too. */
export function useReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, () => window.matchMedia?.(QUERY).matches ?? false);
}
