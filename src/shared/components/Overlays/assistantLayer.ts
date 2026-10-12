import { useSyncExternalStore } from "react";

/*
 * The assistant's panel floats above every page and dialog (data-proton-layer). Dialogs need to know two things
 * about it: a key pressed in it isn't theirs, and while it is open they aren't the only thing on screen.
 */

export const ASSISTANT_LAYER = "[data-proton-layer]";

let open = false;
const listeners = new Set<() => void>();

export function setAssistantOpen(next: boolean) {
    if (open === next) return;
    open = next;
    listeners.forEach((l) => l());
}

export function useAssistantOpen(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => open,
    );
}

/** The event started inside the assistant's layer, so a dialog underneath must leave it alone. */
export function fromAssistant(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(ASSISTANT_LAYER) != null;
}

/*
 * Opening without taking the keyboard: when the assistant opens a window, the window must not keep focus (the
 * person's next keystrokes, or Enter, would land in a form they didn't open). The assistant marks the opening just
 * before it happens, with where the keyboard was; the window that mounts within a moment takes the mark once and
 * gives the keyboard back, even after an autoFocus field took it.
 */

const OPENING_MS = 5_000;
let opening: { at: number; focus: HTMLElement | null } | null = null;

export function markAssistantOpening() {
    opening = { at: Date.now(), focus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
}

/** Where to give the keyboard back to, once, for the window the assistant just opened; null for any other window. */
export function takeAssistantOpening(): HTMLElement | null {
    const mark = opening;
    opening = null;
    return mark && Date.now() - mark.at < OPENING_MS ? mark.focus ?? document.body : null;
}

/*
 * Which known surfaces are open (a dialog names itself with surfaceId), so the assistant knows what the person is
 * looking at; and how to open the ones that live in a page's own state rather than in its link.
 */

const openSurfaces: string[] = [];
const surfaceListeners = new Set<() => void>();
let surfaceSnapshot: string | null = null;

function changedSurfaces() {
    surfaceSnapshot = openSurfaces.at(-1) ?? null;
    surfaceListeners.forEach((l) => l());
}

export function surfaceOpened(id: string): () => void {
    openSurfaces.push(id);
    changedSurfaces();
    return () => {
        const at = openSurfaces.lastIndexOf(id);
        if (at >= 0) openSurfaces.splice(at, 1);
        changedSurfaces();
    };
}

/** The topmost known surface open now, if any. */
export function useOpenSurface(): string | null {
    return useSyncExternalStore(
        (listener) => {
            surfaceListeners.add(listener);
            return () => surfaceListeners.delete(listener);
        },
        () => surfaceSnapshot,
    );
}

const openers = new Map<string, () => void>();

export function registerOpener(id: string, open: () => void): () => void {
    openers.set(id, open);
    return () => {
        if (openers.get(id) === open) openers.delete(id);
    };
}

/** Opens a surface that lives in a page's state, if its page is showing; false when nothing can open it here. */
export function runOpener(id: string): boolean {
    const open = openers.get(id);
    if (!open) return false;
    open();
    return true;
}
