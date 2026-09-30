import { useSyncExternalStore } from "react";
import type { WorkEntry } from "./workApi";

/*
 * The Log work window is opened from many places (the top bar, project cards, the timer, My pay), so it
 * lives outside any one page: this says whether it is open and how, and <LogWorkHost /> shows it.
 */

export type LogWorkOptions = {
    projectId?: number;
    /** "yyyy-MM-dd"; today when left out. */
    date?: string;
    startMin?: number;
    endMin?: number;
    /** "Log overtime": opens on the end of the working day, up to now. */
    overtime?: boolean;
    /** Editing an entry rather than logging a new one. */
    edit?: WorkEntry;
};

type Open = LogWorkOptions & { n: number };

let open: Open | null = null;
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openLogWork(options: LogWorkOptions = {}) {
    open = { ...options, n: ++count };
    emit();
}

export function closeLogWork() {
    open = null;
    emit();
}

export function useLogWork(): Open | null {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => open,
    );
}
