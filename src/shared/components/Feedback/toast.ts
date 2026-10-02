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

/**
 * How long a toast stays, in milliseconds: a plain confirmation briefly; one with an action (Undo) or saying what
 * went wrong long enough to act on it or read it. A toast the pointer or focus is on stays until it leaves.
 */
export const TOAST_MS = { short: 2000, long: 5000 };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
    listeners.forEach((listener) => listener());
}

function countDown(t: Toast) {
    const ms = t.duration ?? (t.action || t.icon === "alert" ? TOAST_MS.long : TOAST_MS.short);
    timers.set(t.id, setTimeout(() => dismissToast(t.id), ms));
}

function stop(id: number) {
    clearTimeout(timers.get(id));
    timers.delete(id);
}

export function toast(t: Omit<Toast, "id">): number {
    const shown = { ...t, id: nextId++ };
    toasts = [...toasts, shown];
    emit();
    countDown(shown);
    return shown.id;
}

export function dismissToast(id: number) {
    stop(id);
    toasts = toasts.filter((t) => t.id !== id);
    emit();
}

/** Keeps a toast while the pointer or focus is on it. */
export function holdToast(id: number) {
    stop(id);
}

/** Starts its countdown again once the pointer or focus leaves it. */
export function releaseToast(id: number) {
    const t = toasts.find((x) => x.id === id);
    if (t && !timers.has(id)) countDown(t);
}

/** Drops every toast (a sign-out: an Undo must not act for the next person). */
export function clearToasts() {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    toasts = [];
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
