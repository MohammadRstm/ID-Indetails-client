import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notificationHandlers, notifications } from "@/test/fixtures/notifications";
import { salaryHandlers } from "@/test/fixtures/salaries";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { resetPushSync } from "./push";
import { notificationOf, openPathOf, parsePush, pushDataFrom, type PushData } from "./pushMessages";

const me = personas.designAdmin;
// RFC 8291's example key: any 65 bytes would do
const KEY = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const OTHER_KEY = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const OWNER_KEY = "hourline.push-owner";

const bytes = (base64url: string) => {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
};

type Subscription = { options: { applicationServerKey: ArrayBuffer }; toJSON: () => unknown; unsubscribe: () => Promise<boolean> };

/** A browser that can get pushes, as far as the app sees it: the permission, the worker and its subscription. */
function browserWithPush(start: { permission?: NotificationPermission; subscribedWith?: string } = {}) {
    const fake = {
        permission: start.permission ?? "default",
        subscription: null as Subscription | null,
        unsubscribed: 0,
        requestPermission: vi.fn(async () => (fake.permission = "granted")),
        subscribe: vi.fn(async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => (fake.subscription = subscriptionWith(applicationServerKey))),
    };
    const subscriptionWith = (key: Uint8Array): Subscription => ({
        options: { applicationServerKey: key.slice().buffer },
        toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "browser-key", auth: "browser-secret" } }),
        unsubscribe: async () => {
            fake.unsubscribed++;
            fake.subscription = null;
            return true;
        },
    });
    if (start.subscribedWith) fake.subscription = subscriptionWith(bytes(start.subscribedWith));

    const registration = { pushManager: { getSubscription: async () => fake.subscription, subscribe: fake.subscribe } };
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { get permission() { return fake.permission; }, requestPermission: fake.requestPermission });
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { getRegistration: async () => registration, ready: Promise.resolve(registration), addEventListener: () => {}, removeEventListener: () => {} },
    });
    return fake;
}

/** The server's side: its key, and what this browser registered or stopped. */
function pushServer(publicKey: string | null = KEY) {
    const calls = { registered: [] as unknown[], stopped: 0 };
    return {
        calls,
        handlers: [
            http.get("/api/auth/web-push", () => HttpResponse.json({ publicKey })),
            http.put("/api/auth/web-push", async ({ request }) => {
                calls.registered.push(await request.json());
                return new HttpResponse(null, { status: 204 });
            }),
            http.delete("/api/auth/web-push", () => {
                calls.stopped++;
                return new HttpResponse(null, { status: 204 });
            }),
        ],
    };
}

// a page that asks the API for nothing more than its own list
const PAGE = "/design/notifications";
const quietPage = notificationHandlers({ items: [], page: 1, pageSize: 20, totalCount: 0 });

async function openAccountMenu() {
    await userEvent.click(await screen.findByRole("button", { name: "Account" }));
}

describe("notifications on this device", () => {
    beforeEach(() => {
        localStorage.clear();
        resetPushSync();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        Reflect.deleteProperty(navigator, "serviceWorker");
    });

    it("are turned on from the account menu: the browser asks, subscribes with the server's key, and the device is registered", async () => {
        const browser = browserWithPush();
        const server = pushServer();
        renderApp(PAGE, me, ...server.handlers, ...quietPage);

        await openAccountMenu();
        await userEvent.click(await screen.findByRole("button", { name: "Turn on notifications" }));

        await waitFor(() => expect(server.calls.registered).toEqual([{ endpoint: ENDPOINT, p256dh: "browser-key", auth: "browser-secret" }]));
        expect(browser.requestPermission).toHaveBeenCalledTimes(1);
        expect(browser.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: bytes(KEY) });
        expect(localStorage.getItem(OWNER_KEY)).toBe(String(me.id));
        expect(await screen.findByText("Notifications are on")).toBeInTheDocument();
        await openAccountMenu();
        expect(await screen.findByRole("button", { name: "Turn off notifications" })).toBeInTheDocument();
    });

    it("are turned off there too: the server stops them and the browser forgets its subscription", async () => {
        localStorage.setItem(OWNER_KEY, String(me.id));
        const browser = browserWithPush({ permission: "granted", subscribedWith: KEY });
        const server = pushServer();
        renderApp(PAGE, me, ...server.handlers, ...quietPage);

        await openAccountMenu();
        await userEvent.click(await screen.findByRole("button", { name: "Turn off notifications" }));

        await waitFor(() => expect(server.calls.stopped).toBe(1));
        expect(browser.unsubscribed).toBe(1);
        expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    });

    it("are offered only where they can work, and say so when the person blocked them", async () => {
        // the server sends browsers none
        browserWithPush();
        const view = renderApp(PAGE, me, ...pushServer(null).handlers, ...quietPage);
        await openAccountMenu();
        expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /notifications/ })).toBeNull();
        view.unmount();

        browserWithPush({ permission: "denied" });
        renderApp(PAGE, me, ...pushServer().handlers, ...quietPage);
        await openAccountMenu();
        expect(await screen.findByRole("button", { name: "Notifications blocked" })).toBeDisabled();
    });

    it("keep coming in a new session of the person who turned them on, and stop for anyone else signing in here", async () => {
        localStorage.setItem(OWNER_KEY, String(me.id));
        browserWithPush({ permission: "granted", subscribedWith: KEY });
        const mine = pushServer();
        const view = renderApp(PAGE, me, ...mine.handlers, ...quietPage);
        await waitFor(() => expect(mine.calls.registered).toHaveLength(1));
        view.unmount();

        resetPushSync();
        const browser = browserWithPush({ permission: "granted", subscribedWith: KEY });
        const theirs = pushServer();
        renderApp(PAGE, personas.designEmployee, ...theirs.handlers, ...quietPage);
        await waitFor(() => expect(browser.unsubscribed).toBe(1));
        expect(theirs.calls.registered).toEqual([]);
    });

    it("subscribe again by themselves when the server's key changed, since the old subscription no longer works", async () => {
        localStorage.setItem(OWNER_KEY, String(me.id));
        const browser = browserWithPush({ permission: "granted", subscribedWith: OTHER_KEY });
        const server = pushServer();
        renderApp(PAGE, me, ...server.handlers, ...quietPage);

        await waitFor(() => expect(server.calls.registered).toHaveLength(1));
        expect(browser.unsubscribed).toBe(1);
        expect(browser.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: bytes(KEY) });
        await openAccountMenu();
        expect(await screen.findByRole("button", { name: "Turn off notifications" })).toBeInTheDocument();
    });

    it("stop on signing out: the browser forgets its subscription", async () => {
        localStorage.setItem(OWNER_KEY, String(me.id));
        const browser = browserWithPush({ permission: "granted", subscribedWith: KEY });
        renderApp(PAGE, me, ...pushServer().handlers, ...quietPage, http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));

        await openAccountMenu();
        await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

        await waitFor(() => expect(browser.unsubscribed).toBe(1));
        expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    });
});

describe("a tapped push", () => {
    const at = (data: PushData) => openPathOf(data);

    it("opens what the bell would for a notification, and marks it read", async () => {
        const hoursShort = notifications.rana.items.find((n) => n.kind === "hours_short")!;
        const read: string[] = [];
        renderApp(at({ forUserId: 1, kind: "hours_short", notificationId: hoursShort.id, target: { type: "page", page: "notifications" } }),
            personas.superAdmin, ...notificationHandlers(), ...salaryHandlers,
            http.post("/api/notifications/:id/read", ({ params }) => { read.push(String(params.id)); return HttpResponse.json({ unread: 0 }); }));

        await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/company/salaries?month=2026-08"));
        await waitFor(() => expect(read).toEqual([String(hoursShort.id)]));
    });

    it("opens the person's notifications when they may not open what it is about, or it is gone", async () => {
        const hoursShort = notifications.rana.items.find((n) => n.kind === "hours_short")!;
        renderApp(at({ forUserId: 2, kind: "hours_short", notificationId: hoursShort.id, target: { type: "page", page: "notifications" } }),
            me, ...notificationHandlers(), http.post("/api/notifications/:id/read", () => HttpResponse.json({ unread: 0 })));
        await waitFor(() => expect(window.location.pathname).toBe("/design/notifications"));
    });

    it("opens a message's chat in the person's own business", async () => {
        renderApp(at({ forUserId: 2, kind: "message", target: { type: "conversation", teamId: 4 } }), me,
            http.get("/api/messages/*", () => HttpResponse.json([])));
        await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/design/messages?group=4"));
    });
});

describe("a push's notification", () => {
    it("shows the server's words, quietly during quiet hours, and leads back to what it is about", () => {
        const data: PushData = { forUserId: 2, kind: "project_created", notificationId: 7, target: { type: "project", id: 12, domain: "design" } };
        const shown = notificationOf(parsePush(JSON.stringify({ title: "New project", body: "Nadia added Villa.", data, badge: 3, quiet: true })));

        expect(shown).toEqual({ title: "New project", options: { body: "Nadia added Villa.", data, icon: "/icons/icon-192.png", silent: true } });
        expect(pushDataFrom(new URLSearchParams(openPathOf(data).split("?")[1]).get("push"))).toEqual(data);
    });

    it("is shown even when it can't be read, as browsers require", () => {
        expect(notificationOf(parsePush("not json"))).toMatchObject({ title: "ID InDetails", options: { body: "Open ID InDetails to see what's new." } });
        expect(pushDataFrom("{}")).toBeNull();
    });
});
