import { useSyncExternalStore } from "react";
import { toast } from "@/shared/components/Feedback/toast";
import { companyNow, DAY } from "./day";
import { openLogWork } from "./logWorkStore";

/*
 * The start/stop timer (the prototype's HL.startTimer). It only remembers when it started, in this
 * browser, so a reload keeps it running; stopping it opens Log work with the times filled in.
 */

type Timer = { userId: number; projectId: number | null; startedAt: string };

const KEY = "hourline.timer";
let timer: Timer | null = read();
const listeners = new Set<() => void>();

function read(): Timer | null {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as Timer) : null;
    } catch {
        return null;
    }
}

function write(next: Timer | null) {
    timer = next;
    try {
        if (next) localStorage.setItem(KEY, JSON.stringify(next));
        else localStorage.removeItem(KEY);
    } catch {
        // storage is unavailable: the timer still runs until the page is closed
    }
    listeners.forEach((l) => l());
}

export function startTimer(userId: number, projectId: number | null = null) {
    write({ userId, projectId, startedAt: new Date().toISOString() });
    toast({ text: "Timer started", sub: "Stop it and the start and end times are filled in for you.", icon: "play" });
}

export function stopTimer() {
    const t = timer;
    write(null);
    if (!t) return;
    const minutes = Math.max(5, Math.round((Date.now() - Date.parse(t.startedAt)) / 60_000));
    const { today, minute } = companyNow();
    const startMin = Math.max(0, minute - minutes);
    openLogWork({ projectId: t.projectId ?? undefined, date: today, startMin, endMin: (startMin + minutes) % DAY });
}

/** The person's running timer, if any. */
export function useTimer(userId: number): Timer | null {
    const t = useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => timer,
    );
    return t && t.userId === userId ? t : null;
}
