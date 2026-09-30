import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import ranaJson from "./notifications/rana.json";
import sarahJson from "./notifications/sarah.json";

/*
 * Notifications captured from the seeded development API: Rana's newest 30 of 77 (labour reports, a month
 * closed short, an overdue invoice, overdue requirements…) and all 18 of Sarah's. `note` writes any other kind.
 */

type Note = Schemas["NotificationResponse"];

export const notifications = {
    rana: ranaJson as unknown as Paged<Note>,
    sarah: sarahJson as unknown as Paged<Note>,
};

export function note(kind: string, payload: Record<string, unknown>, patch: Partial<Note> = {}): Note {
    return { id: 9000, kind, actor: null, project: null, subjectType: null, subjectId: null, payload: payload as Note["payload"], count: 1, createdAt: "2026-09-30T08:00:00Z", readAt: null, ...patch };
}

/** Serves a list as the API pages it, the unread ones alone when asked. */
export function notificationHandlers(list: Paged<Note> = notifications.rana) {
    return [
        http.get("/api/notifications", ({ request }) => {
            const q = new URL(request.url).searchParams;
            const items = q.get("unreadOnly") === "true" ? list.items.filter((n) => !n.readAt) : list.items;
            const page = Number(q.get("page") ?? 1), size = Number(q.get("pageSize") ?? 20);
            return HttpResponse.json({ items: items.slice((page - 1) * size, page * size), page, pageSize: size, totalCount: q.get("unreadOnly") === "true" ? items.length : list.totalCount });
        }),
        http.get("/api/notifications/unread-count", () => HttpResponse.json({ unread: list.items.filter((n) => !n.readAt).length })),
    ];
}
