import { useSyncExternalStore } from "react";
import { toast } from "@/shared/components/Feedback/toast";
import { dayKey, minutesOfDay } from "@/shared/format/time";
import { DAY, MIN_ENTRY } from "./day";
import { openLogWork } from "./logWorkStore";

/*
 * The start/stop timer (the prototype's HL.startTimer). It remembers the moment it started, to the second, in
 * this browser, so a reload keeps it running; stopping it opens Log work with the minute it started and the
 * minute it stopped filled in. An entry is at least 5 minutes, so a shorter run is logged as 5, and says so.
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
    // the clock minutes from the one it started in to the one it stopped in: 2:50:40 to 2:56:10 is 2:50 to 2:56
    const ran = Math.floor(Date.now() / 60_000) - Math.floor(Date.parse(t.startedAt) / 60_000);
    // at least the 5 minutes an entry needs, and at most a day: the form holds an entry that ends the next day
    const minutes = Math.min(DAY - 5, Math.max(MIN_ENTRY, ran));
    // on the day and at the minute it started, so a timer run past midnight keeps its evening part
    const startMin = minutesOfDay(t.startedAt);
    openLogWork({
        projectId: t.projectId ?? undefined, date: dayKey(t.startedAt), startMin, endMin: (startMin + minutes) % DAY,
        shortTimer: ran < MIN_ENTRY ? Math.max(0, ran) : undefined,
    });
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
