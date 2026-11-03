/*
 * The service worker (built by vite-plugin-pwa, see vite.config.ts) shows the installed app an offline page when a page
 * can't be opened without a connection. It never serves the app or anything from the API. Production builds only: in
 * development and tests nothing is registered.
 */

/** How often, at most, coming back to the app looks for a new worker. */
const CHECK_EVERY_MS = 60 * 60_000;

export function registerServiceWorker() {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
        // the browser always asks the server for sw.js, never its own cache
        navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
            .then(checkWhenBack)
            .catch(() => {
                // the app works as before without it, only without the offline page
            });
    }, { once: true });
}

/** An installed app is mostly brought back rather than opened again, and only opening it looks for a new worker. */
function checkWhenBack(registration: ServiceWorkerRegistration) {
    let checkedAt = Date.now();
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || Date.now() - checkedAt < CHECK_EVERY_MS) return;
        checkedAt = Date.now();
        registration.update().catch(() => {
            // offline, or the server busy: a later return tries again
        });
    });
}
