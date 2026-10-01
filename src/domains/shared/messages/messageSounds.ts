import { useEffect, useRef, useSyncExternalStore } from "react";

/*
 * The messages' sounds: a short rising tone when a message is sent, a soft two-note chime when one arrives.
 * They are drawn with the Web Audio API, so there are no sound files to load. Messages arriving together,
 * or one after another within a couple of seconds, chime once. The switch in Messages is remembered in this
 * browser; if storage is blocked, the sounds simply stay on.
 */

const KEY = "hl-message-sounds";
/** Arrivals this close together chime once. */
export const QUIET_MS = 2500;

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
let lastChime = -Infinity;

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

/** One soft sine note: a quick rise, then a fade. */
function note(ctx: AudioContext, frequency: number, start: number, length: number, peak: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
}

/** A message went out. */
export function playSent() {
    if (!on) return;
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    note(ctx, 620, t, 0.09, 0.08);
    note(ctx, 930, t + 0.06, 0.12, 0.06);
}

/** A message came in: once for a burst of them. */
export function playReceived(now = Date.now()) {
    if (!on || now - lastChime < QUIET_MS) return;
    lastChime = now;
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    note(ctx, 880, t, 0.18, 0.07);
    note(ctx, 1320, t + 0.11, 0.26, 0.05);
}

/**
 * Chimes when the unread count goes up: someone else's message arrived (one's own never raise it). The first
 * count, as the page loads, is only remembered.
 */
export function useArrivalChime(unread: number | undefined) {
    const last = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (unread == null) return;
        if (last.current != null && unread > last.current) playReceived();
        last.current = unread;
    }, [unread]);
}
