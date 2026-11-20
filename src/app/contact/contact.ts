import { useSyncExternalStore } from "react";
import { refOf } from "@/api/errors";
import { recentErrors } from "@/api/recentErrors";
import { onSessionReset } from "@/app/session/sessionReset";

/*
 * Contact the developer: a window that opens from anywhere (an error's link, the crash screen, the portal's top bar,
 * Proton), shown by the <ContactHost /> of the signed-in app or portal. The sign-in pages have no host, so an error
 * there offers WhatsApp instead.
 */

/** The error a message is about: an API error's trace id, or the browser's own message for a page that failed. */
export type ContactAbout = { ref: string | null; at: string; message: string | null };

export type ContactOpen = { about: ContactAbout | null; page: string; n: number };

let open: ContactOpen | null = null;
let count = 0;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** Opens the window over the page, about an error when there is one; the page is the one it was opened on. */
export function openContact(about: ContactAbout | null = null) {
    open = { about, page: window.location.pathname, n: ++count };
    emit();
}

export function closeContact() {
    open = null;
    emit();
}

export function useContact(): ContactOpen | null {
    return useSyncExternalStore(subscribe, () => open);
}

/** Says a host shows the window here; returns the undo, for an effect's cleanup. */
export function hostContact(): () => void {
    hosts++;
    emit();
    return () => {
        hosts--;
        emit();
    };
}

/** Whether the window can open here: signed in, in the app or the portal. */
export function useContactHosted(): boolean {
    return useSyncExternalStore(subscribe, () => hosts > 0);
}

/** The reference an error message ends with ("… (ref 4bf92f35)"), as errorMessage writes it. */
export function refIn(text: string): string | null {
    return /\(ref ([A-Za-z0-9\-:.]{1,64})\)$/.exec(text)?.[1] ?? null;
}

/** The error behind a reference on screen: its full trace id and time when it failed in this tab, otherwise now. */
export function aboutRef(ref: string): ContactAbout {
    const known = recentErrors().find((e) => refOf(e.ref) === ref);
    return { ref: known?.ref ?? ref, at: known?.at ?? new Date().toISOString(), message: null };
}

/** A page that failed while drawing: the browser's message, on one line, as the API takes it. */
export function aboutCrash(error: unknown): ContactAbout {
    const raw = error instanceof Error ? error.message : String(error);
    const text = [...raw].map((c) => (c < " " || c === "\u007f" ? " " : c)).join("").trim();
    return { ref: null, at: new Date().toISOString(), message: (text || "The page failed").slice(0, 300) };
}

/** The developer's WhatsApp chat, with a first message when there is one. */
export function whatsAppLink(number: string, text?: string): string {
    return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const BANNER_KEY = "hourline.contact-banner";

/** Whether this person has seen the Contact banner on this device (closed it or opened it). */
export function contactBannerSeen(userId: number): boolean {
    try {
        return localStorage.getItem(`${BANNER_KEY}.${userId}`) === "seen";
    } catch {
        return false;
    }
}

export function putContactBannerAway(userId: number) {
    try {
        localStorage.setItem(`${BANNER_KEY}.${userId}`, "seen");
    } catch {
        // private window: it stays away for this visit only
    }
}

// a message being written belongs to the person who started it
onSessionReset(closeContact);
