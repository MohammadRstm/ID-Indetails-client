import { useSyncExternalStore } from "react";
import type { IconName } from "@/shared/icons/icons";

/*
 * The prototype's toasts: a short confirmation of something the person just did, with an optional action
 * (Undo). Failures of what is on screen are shown next to it instead, not as toasts.
 */

export type Toast = {
    id: number;
    text: string;
    sub?: string;
    icon?: IconName;
    actionLabel?: string;
    action?: () => void;
    duration?: number;
};

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((listener) => listener());
}

export function toast(t: Omit<Toast, "id">): number {
    const id = nextId++;
    toasts = [...toasts, { ...t, id }];
    emit();
    setTimeout(() => dismissToast(id), t.duration ?? 6500);
    return id;
}

export function dismissToast(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
}

export function useToasts(): Toast[] {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => toasts,
    );
}
