/*
 * What a push from the API turns into (the API's docs/notifications.md, "Browsers"), shared by the service worker
 * (src/sw.ts) and the app: the notification shown, and where a tap on it leads. Nothing here may need the page or
 * the worker alone, since both import it.
 */

/** Where a push leads, as the phone app's contract describes it: a type and the ids it needs. */
export type PushTarget = {
    type: string;
    id?: number;
    projectId?: number;
    domain?: string;
    section?: string;
    teamId?: number;
    userId?: number;
    weekStart?: string;
    page?: string;
};

/** A push's data: ids only, never text or amounts. */
export type PushData = {
    forUserId: number;
    /** A notification kind, "message", "log_reminder" or "labour_week_reminder". */
    kind: string;
    notificationId?: number;
    target: PushTarget;
};

/** What the API posts to the browser. */
export type Push = { title?: string; body?: string; data?: PushData; badge?: number; quiet?: boolean };

/** The page a tapped push opens at: the app works out where it leads, with the person's permissions (PushOpener). */
export const OPEN_PUSH_PATH = "/open-push";

/** What the worker tells an open window, which then opens the push without reloading. */
export const OPEN_PUSH_MESSAGE = "hourline-open-push";

export function openPathOf(data: PushData | undefined): string {
    return data ? `${OPEN_PUSH_PATH}?push=${encodeURIComponent(JSON.stringify(data))}` : "/";
}

export function pushDataFrom(text: string | null): PushData | null {
    try {
        const data = JSON.parse(text ?? "") as PushData;
        return typeof data?.kind === "string" && typeof data.target?.type === "string" ? data : null;
    } catch {
        return null;
    }
}

export function parsePush(text: string | undefined): Push | null {
    try {
        const push = JSON.parse(text ?? "") as Push;
        return push && typeof push === "object" ? push : null;
    } catch {
        return null;
    }
}

/**
 * The notification a push shows. Every push shows one, even one that can't be read: a browser may stop the pushes of a
 * site that receives one without showing it (Safari does). During quiet hours it comes without sound or vibration,
 * where the browser allows it.
 */
export function notificationOf(push: Push | null): { title: string; options: NotificationOptions } {
    return {
        title: push?.title ?? "ID InDetails",
        options: {
            body: push?.title ? push.body : "Open ID InDetails to see what's new.",
            data: push?.data,
            icon: "/icons/icon-192.png",
            silent: push?.quiet === true,
        },
    };
}
