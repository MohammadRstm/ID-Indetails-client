import { useEffect, useRef, useSyncExternalStore } from "react";

/*
 * The app's sounds: a short rising tone when a message is sent, a soft two-note chime when one arrives, and a
 * falling bell when a notification comes in. They are drawn with the Web Audio API, so there are no sound files
 * to load. A burst of arrivals sounds once: the first chimes, and the ones that follow stay quiet until nothing
 * has arrived for QUIET_MS. Messages and notifications are grouped apart. One switch turns them all off; it is
 * remembered in this browser, and if storage is blocked the sounds simply stay on.
 */

const KEY = "hl-message-sounds";
/** How long arrivals must stop before the next one chimes again. */
export const QUIET_MS = 1500;

const listeners = new Set<() => void>();

function read(): boolean {
    try {
        return localStorage.getItem(KEY) !== "off";
    } catch {
        return true;
    }
}

let on = read();
let context: AudioContext | null = null;

export function setMessageSounds(next: boolean) {
    on = next;
    try {
        localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
        // Not remembered, still applied.
    }
    listeners.forEach((listener) => listener());
}

export function useMessageSounds(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => on,
    );
}

/** The browser's audio, once it allows it (after the person has used the page). Null where there is none. */
function audio(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    try {
        context ??= new AudioContext();
        if (context.state === "suspended") void context.resume().catch(() => {});
        return context;
    } catch {
        return null;
    }
}

// Browsers only let a page play sound once the person has used it: the audio is woken by their first press or
// key, so the first message that arrives after that is heard.
if (typeof document !== "undefined") {
    const wake = () => {
        if (on) audio();
        document.removeEventListener("pointerdown", wake, true);
        document.removeEventListener("keydown", wake, true);
    };
    document.addEventListener("pointerdown", wake, true);
    document.addEventListener("keydown", wake, true);
}

/** One soft note: a quick rise, then a fade. */
function note(ctx: AudioContext, frequency: number, start: number, length: number, peak: number, type: OscillatorType = "sine") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
}

/** True for the first of a burst: nothing has arrived for QUIET_MS. Every arrival restarts the wait. */
function burst() {
    let last = -Infinity;
    return (now: number) => {
        const first = now - last >= QUIET_MS;
        last = now;
        return first;
    };
}
const messageBurst = burst();
const notificationBurst = burst();

/** A message went out. */
export function playSent() {
    if (!on) return;
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    note(ctx, 620, t, 0.09, 0.11);
    note(ctx, 930, t + 0.06, 0.12, 0.08);
}

/** A message came in: once for a burst of them. */
export function playReceived(now = Date.now()) {
    if (!messageBurst(now) || !on) return;
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    note(ctx, 880, t, 0.18, 0.12);
    note(ctx, 1320, t + 0.11, 0.26, 0.09);
}

/** A notification came in: once for a burst of them. */
export function playNotification(now = Date.now()) {
    if (!notificationBurst(now) || !on) return;
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    note(ctx, 1568, t, 0.32, 0.1, "triangle");
    note(ctx, 1175, t + 0.14, 0.5, 0.1, "triangle");
}

/** Plays `sound` when a count goes up. The first count, as the page loads, is only remembered. */
function useChimeOnRise(count: number | undefined, sound: () => void) {
    const last = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (count == null) return;
        if (last.current != null && count > last.current) sound();
        last.current = count;
    }, [count, sound]);
}

/** Chimes when the unread messages go up: someone else's message arrived (one's own never raise it). */
export const useArrivalChime = (unread: number | undefined) => useChimeOnRise(unread, playReceived);

/** Rings when the unread notifications go up. */
export const useNotificationChime = (unread: number | undefined) => useChimeOnRise(unread, playNotification);
