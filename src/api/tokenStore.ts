/*
 * The access token lives in memory only, never in storage, so a script injected into the page can't read
 * it from there. A reload loses it, and the session is restored from the refresh cookie (see session.ts).
 */

type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export const tokenStore = {
    get(): string | null {
        return accessToken;
    },

    set(token: string | null) {
        accessToken = token;
        listeners.forEach((listener) => listener(token));
    },

    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};
