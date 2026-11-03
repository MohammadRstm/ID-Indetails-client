import { useEffect, useSyncExternalStore } from "react";

/*
 * Installing the app (docs/deployment.md, "The installed app"). Chromium, on Android and on computers, offers its own
 * prompt through a beforeinstallprompt event, which fires once and early: it is caught as the app starts (main.tsx).
 * iOS has no prompt: the app is added from the Share menu, so the app shows the steps. Opened from its icon, or once
 * installed, the app offers nothing.
 */

type InstallPromptEvent = Event & { prompt(): Promise<unknown> };

/** How this browser installs the app: its own prompt, the iOS steps, or not at all. */
export type InstallWay = "prompt" | "ios" | null;

const BANNER_KEY = "hourline.install-banner";
const BANNER_AWAY_MS = 30 * 24 * 60 * 60_000;

let deferred: InstallPromptEvent | null = null;
let installed = false;
let stepsOpen = false;
let bannerAway = readBannerAway();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export function catchInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => {
        // the browser's own install bar stays away: the app offers installing where it fits
        event.preventDefault();
        deferred = event as InstallPromptEvent;
        changed();
    });
    window.addEventListener("appinstalled", () => {
        deferred = null;
        installed = true;
        changed();
    });
}

/** Opened as the installed app, from its icon, rather than in a browser tab. */
function isStandalone(): boolean {
    return !!window.matchMedia?.("(display-mode: standalone)")?.matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** An iPhone or iPad. iPadOS says it is a Mac, but a Mac has no touch screen. */
function isIos(): boolean {
    const agent = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

function installWay(): InstallWay {
    if (installed || isStandalone()) return null;
    if (deferred) return "prompt";
    return isIos() ? "ios" : null;
}

export function useInstallWay(): InstallWay {
    return useSyncExternalStore(subscribe, installWay);
}

/** Installs the app the way this browser can: its own prompt (usable once), or the iOS steps. */
export function installApp() {
    if (deferred) {
        const event = deferred;
        deferred = null;
        changed();
        // accepted: appinstalled follows; dismissed: Chromium may offer it again later
        event.prompt().catch(() => {});
    } else if (isIos()) {
        stepsOpen = true;
        changed();
    }
}

export function useInstallStepsOpen(): boolean {
    return useSyncExternalStore(subscribe, () => stepsOpen);
}

export function closeInstallSteps() {
    stepsOpen = false;
    changed();
}

// The phone's banner, once put away (or used), stays away for a month in this browser; the account menu still offers it.
function readBannerAway(): boolean {
    try {
        return Date.now() - Number(localStorage.getItem(BANNER_KEY) ?? 0) < BANNER_AWAY_MS;
    } catch {
        return false;
    }
}

export function useInstallBannerAway(): boolean {
    return useSyncExternalStore(subscribe, () => bannerAway);
}

export function putInstallBannerAway() {
    bannerAway = true;
    try {
        localStorage.setItem(BANNER_KEY, String(Date.now()));
    } catch {
        // private window: put away until the app is opened again
    }
    changed();
}

/**
 * The client portal isn't installed as the staff's app (it will be an app of its own): its pages leave out the
 * manifest, so the browser offers no install there.
 */
export function useNoInstall() {
    useEffect(() => {
        const manifest = document.querySelector('link[rel="manifest"]');
        if (!manifest) return;
        manifest.remove();
        return () => {
            document.head.append(manifest);
        };
    }, []);
}
