import { useSyncExternalStore } from "react";

/*
 * Light or dark: light is the default, the choice is set as data-theme on <html> (hourline.css has a full
 * token set for each) and remembered in this browser. If storage is blocked the app simply opens in light
 * every time.
 */

export type Theme = "light" | "dark";

const KEY = "hl-theme";
const listeners = new Set<() => void>();

function read(): Theme {
    try {
        return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch {
        return "light";
    }
}

let current: Theme = read();

export function applyTheme() {
    document.documentElement.setAttribute("data-theme", current);
}

export function setTheme(theme: Theme) {
    current = theme;
    applyTheme();
    try {
        localStorage.setItem(KEY, theme);
    } catch {
        // Not remembered, still applied.
    }
    listeners.forEach((listener) => listener());
}

export function toggleTheme() {
    setTheme(current === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => current,
    );
}
