import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
}

/** Whether this tab is the one being looked at: what is on screen in a hidden tab isn't read. */
export function usePageVisible(): boolean {
    return useSyncExternalStore(subscribe, () => document.visibilityState !== "hidden", () => true);
}
