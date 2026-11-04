import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
    };
};

/** Whether the device has a connection at all (a connected device can still fail to reach the server). */
export function useOnline(): boolean {
    return useSyncExternalStore(subscribe, () => navigator.onLine);
}
