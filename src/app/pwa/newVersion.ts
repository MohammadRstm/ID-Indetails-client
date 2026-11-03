import { useSyncExternalStore } from "react";

/*
 * A deploy shows at the next load, but an app left open keeps running the code it started with, and an installed app
 * is mostly brought back rather than opened again. So while the app is on screen, now and then, it asks the server for
 * index.html (never cached) and compares the app's code named there with the code running here. When they differ,
 * the shell offers to reload (UpdateBanner). Production builds only.
 */

const CHECK_EVERY_MS = 15 * 60_000;

let ready = false;
const listeners = new Set<() => void>();

/** The app's code a page loads: the src of its first script, e.g. "/assets/index-a1b2c3.js". */
export function entryScript(html: string): string | null {
    return /<script\b[^>]*\bsrc="([^"]+)"/.exec(html)?.[1] ?? null;
}

export function watchForNewVersion() {
    if (!import.meta.env.PROD) return;
    const running = document.querySelector("script[src]")?.getAttribute("src");
    if (!running) return;

    let checkedAt = Date.now();
    const check = () => {
        if (document.visibilityState !== "visible" || Date.now() - checkedAt < CHECK_EVERY_MS) return;
        checkedAt = Date.now();
        fetch("/index.html", { cache: "no-store" })
            .then((response) => (response.ok ? response.text() : null))
            .then((html) => {
                const deployed = html && entryScript(html);
                if (!deployed || deployed === running) return;
                document.removeEventListener("visibilitychange", check);
                clearInterval(timer);
                ready = true;
                listeners.forEach((listener) => listener());
            })
            .catch(() => {
                // offline, or the server busy: the next check asks again
            });
    };
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, CHECK_EVERY_MS);
}

/** Whether a newer version of the app has gone out since this one loaded. */
export function useNewVersionReady(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => ready,
    );
}
