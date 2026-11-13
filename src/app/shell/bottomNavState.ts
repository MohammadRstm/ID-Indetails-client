import { useEffect, useState, useSyncExternalStore } from "react";

/*
 * When the phone's bottom bar steps aside: while a text field has the keyboard up, and while a page asks for the whole
 * screen (an open conversation in Messages). Proton's own page asks through its store.
 */

/** Inputs that open no keyboard: buttons, ticks, sliders, files and the pickers. */
const NO_KEYBOARD = new Set(["button", "checkbox", "radio", "range", "file", "color", "submit", "reset", "image", "hidden", "date", "time", "datetime-local", "month", "week"]);

/** Whether this element takes typed text (so a phone's keyboard comes up over the page). */
export function takesText(el: EventTarget | null): boolean {
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
    if (el instanceof HTMLInputElement) return !NO_KEYBOARD.has(el.type) && !el.readOnly && !el.disabled;
    return el instanceof HTMLElement && ["", "true", "plaintext-only"].includes(el.getAttribute("contenteditable") ?? "false");
}

/** Whether a text field is focused right now. */
export function useTypingInField(): boolean {
    const [typing, setTyping] = useState(() => takesText(document.activeElement));
    useEffect(() => {
        const onIn = (e: FocusEvent) => setTyping(takesText(e.target));
        // focus moving from one field to another never shows the bar in between
        const onOut = (e: FocusEvent) => setTyping(takesText(e.relatedTarget));
        document.addEventListener("focusin", onIn);
        document.addEventListener("focusout", onOut);
        // a field taken off the page while it has the keyboard (a window that closes) sends no focusout: look again then
        const gone = new MutationObserver(() => setTyping(takesText(document.activeElement)));
        gone.observe(document.body, { childList: true, subtree: true });
        return () => {
            document.removeEventListener("focusin", onIn);
            document.removeEventListener("focusout", onOut);
            gone.disconnect();
        };
    }, []);
    return typing;
}

let holds = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Hides the bar until the returned function is called. */
function hold(): () => void {
    holds += 1;
    changed();
    return () => {
        holds -= 1;
        changed();
    };
}

/** A page that needs the whole screen (an open chat) hides the bar while `hide` is true. */
export function useHideBottomNav(hide: boolean) {
    useEffect(() => (hide ? hold() : undefined), [hide]);
}

/** Whether a page has asked for the bar to be hidden. */
export function useBottomNavHeld(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        () => holds > 0,
    );
}
