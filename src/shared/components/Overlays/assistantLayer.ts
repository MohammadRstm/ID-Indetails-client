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
