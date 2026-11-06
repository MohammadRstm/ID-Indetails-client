import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";
import { toast } from "@/shared/components/Feedback/toast";
import { isIos, isStandalone } from "./install";
import { OPEN_PUSH_MESSAGE } from "./pushMessages";

/*
 * Notifications on this device (docs/deployment.md, "The installed app"): the browser's own push service, registered
 * with the API for this session, as the phone app registers its token. They are turned on from the account menu, where
 * the browser asks permission from that tap (iOS allows it no other way), and off again there; signing out stops them.
 * The browser remembers who turned them on, so whoever signs in next on a shared computer doesn't get them unasked.
 */

/**
 * - `unavailable`: this browser can't, or the server sends browsers no pushes;
 * - `install`: an iPhone or iPad, which gets pushes only in the installed app;
 * - `blocked`: the person refused, so only the browser's site settings can allow them again.
 */
export type PushState = "unavailable" | "install" | "blocked" | "off" | "on";

const OWNER_KEY = "hourline.push-owner";
const BANNER_AWAY_KEY = "hourline.push-banner";
const BANNER_AWAY_MS = 30 * 24 * 60 * 60_000;

/** How often an open app registers its subscription again, so it follows a new session (a password change). */
const SYNC_EVERY_MS = 60 * 60_000;

function supported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function owner(): number | null {
    try {
        return Number(localStorage.getItem(OWNER_KEY)) || null;
    } catch {
        return null;
    }
}

function setOwner(userId: number | null) {
    try {
        if (userId) localStorage.setItem(OWNER_KEY, String(userId));
        else localStorage.removeItem(OWNER_KEY);
    } catch {
        // private window: nobody is remembered, so the next sign-in starts with them off
    }
}

/** Whether the installed app's offer to turn notifications on was put away, or they were turned off, in the last month. */
export function pushBannerAway(): boolean {
    try {
        return Date.now() - Number(localStorage.getItem(BANNER_AWAY_KEY) ?? 0) < BANNER_AWAY_MS;
    } catch {
        return false;
    }
}

export function putPushBannerAway() {
    try {
        localStorage.setItem(BANNER_AWAY_KEY, String(Date.now()));
    } catch {
        // private window: put away until the app is opened again
    }
}

function bytesOf(base64url: string): Uint8Array<ArrayBuffer> {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}

/** Whether the subscription was made with the server's current key: a new key pair makes old subscriptions useless. */
function madeWith(subscription: PushSubscription, publicKey: string): boolean {
    const key = subscription.options.applicationServerKey;
    if (!key) return false;
    const mine = new Uint8Array(key), theirs = bytesOf(publicKey);
    return mine.length === theirs.length && mine.every((b, i) => b === theirs[i]);
}

async function register(subscription: PushSubscription) {
    const { endpoint, keys: { p256dh, auth } = {} } = subscription.toJSON();
    await http.put("/auth/web-push", { endpoint, p256dh, auth });
}

async function subscription(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
}

/** This browser's subscription made with the server's key: the one it has, or a new one. Needs the permission. */
async function subscribedWith(publicKey: string): Promise<PushSubscription> {
    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();
    if (current && madeWith(current, publicKey)) return current;
    await current?.unsubscribe();
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesOf(publicKey) });
}

async function readState(userId: number): Promise<{ state: PushState; publicKey: string | null }> {
    if (!supported()) return { state: isIos() && !isStandalone() ? "install" : "unavailable", publicKey: null };
    const [{ publicKey }, registration] = await Promise.all([
        http.get<Schemas["WebPushKeyResponse"]>("/auth/web-push").then((r) => r.data),
        navigator.serviceWorker.getRegistration(),
    ]);
    // no worker in development, or none yet
    if (!publicKey || !registration) return { state: "unavailable", publicKey: null };
    if (Notification.permission === "denied") return { state: "blocked", publicKey };
    const current = await registration.pushManager.getSubscription();
    const on = Notification.permission === "granted" && current !== null && madeWith(current, publicKey) && owner() === userId;
    return { state: on ? "on" : "off", publicKey };
}

export function usePush(userId: number) {
    const invalidate = useInvalidate();
    const state = useQuery({ queryKey: keys.webPush.state(userId), queryFn: () => readState(userId), staleTime: Infinity });
    const [busy, setBusy] = useState(false);
    const publicKey = state.data?.publicKey ?? null;

    /** Must be called straight from a tap: iOS only asks for permission then. */
    const turnOn = async () => {
        if (!publicKey) return;
        setBusy(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                if (permission === "denied") toast({ text: "Notifications are blocked", sub: "Allow them for this site in the browser's settings.", icon: "alert" });
                return;
            }
            await register(await subscribedWith(publicKey));
            setOwner(userId);
            toast({ text: "Notifications are on", sub: "This device gets them while you're signed in here.", icon: "bell" });
        } catch {
            toast({ text: "Notifications couldn't be turned on", sub: "Try again in a moment.", icon: "alert" });
        } finally {
            setBusy(false);
            void invalidate(keys.webPush.all);
        }
    };

    const turnOff = async () => {
        setBusy(true);
        try {
            await http.delete("/auth/web-push");
            await (await subscription())?.unsubscribe();
            setOwner(null);
            // turned off on purpose: the banner doesn't offer them again straight away
            putPushBannerAway();
            toast({ text: "Notifications are off for this device", icon: "bell" });
        } catch {
            toast({ text: "Notifications couldn't be turned off", sub: "Try again in a moment.", icon: "alert" });
        } finally {
            setBusy(false);
            void invalidate(keys.webPush.all);
        }
    };

    return { state: state.data?.state ?? "unavailable", busy, turnOn, turnOff };
}

/** After signing out: the server already stopped this browser's pushes with its session; it forgets them too. */
export async function forgetPush() {
    setOwner(null);
    if (!supported()) return;
    try {
        await (await subscription())?.unsubscribe();
    } catch {
        // the subscription is dead on the server anyway
    }
}

let lastSync = 0;

/**
 * Keeps this browser registered for the person's session while the app is open: at the start, and when it comes back
 * after an hour away, so a new session (a password change) keeps the pushes. A subscription someone else turned on is
 * dropped; one made with an earlier key of the server's is made again, since the permission is already given.
 */
export function usePushSync(userId: number) {
    const invalidate = useInvalidate();
    useEffect(() => {
        if (!supported()) return;
        const sync = async () => {
            if (Date.now() - lastSync < SYNC_EVERY_MS) return;
            lastSync = Date.now();
            const current = await subscription();
            if (!current || Notification.permission !== "granted") return;
            if (owner() !== userId) {
                await current.unsubscribe();
            } else {
                const { publicKey } = (await http.get<Schemas["WebPushKeyResponse"]>("/auth/web-push")).data;
                if (!publicKey) return;
                await register(await subscribedWith(publicKey));
            }
            void invalidate(keys.webPush.all);
        };
        const onShow = () => {
            if (document.visibilityState === "visible") void sync().catch(() => {});
        };
        void sync().catch(() => {});
        document.addEventListener("visibilitychange", onShow);
        return () => document.removeEventListener("visibilitychange", onShow);
    }, [userId, invalidate]);
}

/** In an open window, a tap on a push opens it here without reloading the app (the worker sends the address). */
export function usePushLinks() {
    const navigate = useNavigate();
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;
        const worker = navigator.serviceWorker;
        const onMessage = (event: MessageEvent<{ type?: string; path?: string }>) => {
            if (event.data?.type === OPEN_PUSH_MESSAGE && event.data.path?.startsWith("/")) navigate(event.data.path);
        };
        worker.addEventListener("message", onMessage);
        return () => worker.removeEventListener("message", onMessage);
    }, [navigate]);
}

/** Forgets when the app last registered, so the next person, or a test, starts afresh. */
export function resetPushSync() {
    lastSync = 0;
}

type BadgeNavigator = Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** The count on the installed app's icon follows what is unread, as each push sets it while the app is closed. */
export function useAppBadge(count: number | null) {
    useEffect(() => {
        if (count === null || !isStandalone()) return;
        const badge = navigator as BadgeNavigator;
        void (count > 0 ? badge.setAppBadge?.(count) : badge.clearAppBadge?.())?.catch(() => {});
    }, [count]);
}
