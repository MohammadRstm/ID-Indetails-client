/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { enable as enableNavigationPreload } from "workbox-navigation-preload";
import { cleanupOutdatedCaches, PrecacheFallbackPlugin, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";
import { notificationOf, OPEN_PUSH_MESSAGE, openPathOf, parsePush, type PushData } from "./app/pwa/pushMessages";

/*
 * The installed app's service worker (docs/deployment.md, "The installed app"), built by vite-plugin-pwa
 * (vite.config.ts). It shows offline.html when a page can't be opened for want of a connection, and the pushes of the
 * API. It never serves the app itself or anything from the API, so a deploy shows at the next load as before, and
 * nobody's data is ever kept in its cache.
 */

declare const self: ServiceWorkerGlobalScope;

// only the offline page and the install's own files (the manifest and its icons come with it): never index.html or the
// app's code
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// the page's request starts while the worker wakes up, so the worker adds no wait to opening the app
enableNavigationPreload();
// the worker holds no version of the app, so a new one can take over at once
void self.skipWaiting();
clientsClaim();

// Opening a page of the app always goes to the network, and shows the offline page only when there is none. The API, the
// live connection and the API's own documents are left alone.
registerRoute(
    ({ request, url, sameOrigin }) => request.mode === "navigate" && sameOrigin && !/^\/(api|hubs|openapi|healthz)(\/|$)/.test(url.pathname),
    new NetworkOnly({ plugins: [new PrecacheFallbackPlugin({ fallbackURL: "/offline.html" })] }),
);

type BadgeNavigator = WorkerNavigator & { setAppBadge?: (count: number) => Promise<void> };

self.addEventListener("push", (event) => {
    const push = parsePush(event.data?.text());
    const { title, options } = notificationOf(push);
    const navigator = self.navigator as BadgeNavigator;
    event.waitUntil(Promise.all([
        self.registration.showNotification(title, options),
        // the count on the app's icon, where the system shows one
        push?.badge !== undefined ? navigator.setAppBadge?.(push.badge).catch(() => {}) : undefined,
    ]));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(openPush(event.notification.data as PushData | undefined));
});

/** Brings the app forward on what the push is about: an open window opens it without reloading, or a new one opens. */
async function openPush(data: PushData | undefined) {
    const windows = await self.clients.matchAll({ type: "window" });
    const open = windows[0];
    if (open) {
        await open.focus();
        open.postMessage({ type: OPEN_PUSH_MESSAGE, path: openPathOf(data) });
        return;
    }
    await self.clients.openWindow(openPathOf(data));
}
