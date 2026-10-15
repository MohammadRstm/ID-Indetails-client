import { http, HttpResponse } from "msw";
import type { CommentThread, CommentThreadSummary, DiscussionPerson, DiscussionSummary, PortalChatMessage, PortalComment } from "./discussionTypes";

/*
 * What the discussion's tests share: the API's shapes as small builders, and a mock of the discussion endpoints that
 * keeps the messages and the comment threads, answers as the real API is meant to and writes down what was asked.
 */

/** The client's discussion address, and the staff's. */
export const CLIENT_BASE = "/api/portal/projects/:id/discussion";
export const STAFF_BASE = "/api/projects/:id/portal/discussion";

export const rania: DiscussionPerson = { key: "c7", name: "Rania Aoun", kind: "client", isYou: false };
export const nadia: DiscussionPerson = { key: "u2", name: "Nadia Karam", kind: "staff", isYou: false };
export const sarah: DiscussionPerson = { key: "u4", name: "Sarah Haddad", kind: "staff", isYou: false };
/** Another of the client's contacts, for a test that needs two (none of the defaults has him). */
export const omar: DiscussionPerson = { key: "c9", name: "Omar Saad", kind: "client", isYou: false };

/** The people in the project's discussion as one of them sees it: that one is "you". */
export const peopleFor = (viewerKey: string): DiscussionPerson[] => [rania, nadia, sarah].map((p) => ({ ...p, isYou: p.key === viewerKey }));
export const youAre = (viewerKey: string): DiscussionPerson => peopleFor(viewerKey).find((p) => p.key === viewerKey)!;

const AT = "2026-10-14T09:00:00Z";

export const summaryOf = (viewerKey: string, over: Partial<DiscussionSummary> = {}): DiscussionSummary => ({
    projectId: 2, canWrite: true, closedReason: null, unreadMessages: 0, unreadComments: 0, lastMessageId: null, lastCommentId: null,
    participants: peopleFor(viewerKey), threads: [], ...over,
});

export const threadSummaryOf = (itemId: number, title: string, over: Partial<CommentThreadSummary> = {}): CommentThreadSummary => ({
    itemId, title, fileName: `${title}.jpg`, available: true, count: 1, unread: 0, lastAt: AT, ...over,
});

/** A chat message; a null body is one deleted for everyone. */
export const messageOf = (id: number, author: DiscussionPerson, body: string | null, over: Partial<PortalChatMessage> = {}): PortalChatMessage => ({
    id, author, body, deleted: body == null, mentions: [], createdAt: AT, editedAt: null, canEdit: author.isYou && body != null, ...over,
});

export const commentOf = (id: number, itemId: number, author: DiscussionPerson, body: string | null, over: Partial<PortalComment> = {}): PortalComment => ({
    id, itemId, author, body, deleted: body == null, mentions: [], fileName: "Living room.jpg", onEarlierVersion: false, createdAt: AT, editedAt: null,
    canEdit: author.isYou && body != null, canDelete: author.isYou && body != null, ...over,
});

export const threadOf = (itemId: number, title: string, comments: PortalComment[], over: Partial<CommentThread> = {}): CommentThread => ({
    itemId, title, fileName: `${title}.jpg`, available: true, comments, ...over,
});

export type Call = { method: string; path: string; search: string; body: unknown };

/** A file clients can see now, as the presentation lists it (a presentation item will do). */
export type SharedFile = { id: number; title: string; name: string };

/** What the writing endpoints are sent. */
type Sent = { body: string; mentions: string[]; clientToken: string; itemId: number; lastMessageId?: number; lastCommentId?: number };

export type MockDiscussion = {
    summary: DiscussionSummary;
    /** Oldest first. */
    messages: PortalChatMessage[];
    threads: Record<number, CommentThread>;
    /** The next this many message sends fail with a 500. */
    failSends: number;
    /** Everything asked of the discussion, in order. */
    calls: Call[];
    /** The calls of one kind, e.g. calls("POST", "/messages"). */
    called: (method: string, path: string) => Call[];
};

const failure = (status: number, code: string, message: string) => HttpResponse.json({ type: "error", code, message }, { status });

/**
 * The discussion endpoints under `base` (CLIENT_BASE or STAFF_BASE), answering from `box`: a test sets what is there and
 * reads what was sent. A send with the same clientToken as an earlier one gets the same message back, as the API does.
 * `published` are the files clients can see: one nobody has commented on has an empty thread, and a file that is neither
 * published nor commented on is not found, as with the API.
 */
export function mockDiscussion(
    base: string,
    init: Partial<Pick<MockDiscussion, "summary" | "messages" | "threads">> & { viewer: string; published?: SharedFile[] },
) {
    const published = init.published ?? [];
    const box: MockDiscussion = {
        summary: init.summary ?? summaryOf(init.viewer),
        messages: init.messages ?? [],
        threads: init.threads ?? {},
        failSends: 0,
        calls: [],
        called: (method, path) => box.calls.filter((c) => c.method === method && c.path.endsWith(path)),
    };
    const sent = new Map<string, PortalChatMessage | PortalComment>();
    const me = () => box.summary.participants.find((p) => p.isYou)!;
    const comments = () => Object.values(box.threads).flatMap((t) => t.comments);
    const nextCommentId = () => Math.max(0, ...comments().map((c) => c.id)) + 1;

    async function note(request: Request): Promise<Sent> {
        const url = new URL(request.url);
        const body = request.method === "GET" || request.method === "DELETE" ? null : await request.clone().json();
        box.calls.push({ method: request.method, path: url.pathname, search: url.search, body });
        return (body ?? {}) as Sent;
    }
    const replaceComment = (id: number, change: (c: PortalComment) => PortalComment) => {
        for (const thread of Object.values(box.threads)) {
            const at = thread.comments.findIndex((c) => c.id === id);
            if (at >= 0) return (thread.comments[at] = change(thread.comments[at]));
        }
        return null;
    };

    const handlers = [
        http.get(base, async ({ request }) => {
            await note(request);
            return HttpResponse.json(box.summary);
        }),
        http.get(`${base}/messages`, async ({ request }) => {
            await note(request);
            const query = new URL(request.url).searchParams;
            const before = Number(query.get("before")) || Infinity;
            const limit = Number(query.get("limit")) || 30;
            const older = box.messages.filter((m) => m.id < before);
            const page = older.slice(-limit);
            return HttpResponse.json({ messages: page, hasMore: older.length > page.length });
        }),
        http.post(`${base}/messages`, async ({ request }) => {
            const body = await note(request);
            if (box.failSends > 0) {
                box.failSends--;
                return failure(500, "internal_error", "The message couldn't be sent. Try again.");
            }
            const known = sent.get(body.clientToken);
            if (known) return HttpResponse.json(known);
            const message = messageOf(Math.max(0, ...box.messages.map((m) => m.id)) + 1, me(), body.body, { mentions: body.mentions });
            box.messages.push(message);
            sent.set(body.clientToken, message);
            return HttpResponse.json(message);
        }),
        http.put(`${base}/messages/:messageId`, async ({ request, params }) => {
            const body = await note(request);
            const at = box.messages.findIndex((m) => m.id === Number(params.messageId));
            if (at < 0) return failure(404, "not_found", "Not found.");
            box.messages[at] = { ...box.messages[at], body: body.body, mentions: body.mentions, editedAt: AT };
            return HttpResponse.json(box.messages[at]);
        }),
        // the author deletes it for everyone: it stays, without its words or mentions (again: the same answer)
        http.delete(`${base}/messages/:messageId`, async ({ request, params }) => {
            await note(request);
            const at = box.messages.findIndex((m) => m.id === Number(params.messageId));
            if (at < 0) return failure(404, "not_found", "Not found.");
            if (!box.messages[at].author.isYou) return failure(403, "forbidden", "Only its author can delete a message.");
            box.messages[at] = { ...box.messages[at], body: null, deleted: true, mentions: [], canEdit: false };
            return HttpResponse.json(box.messages[at]);
        }),
        http.get(`${base}/comments/:itemId`, async ({ request, params }) => {
            await note(request);
            const itemId = Number(params.itemId);
            const thread = box.threads[itemId];
            if (thread) return HttpResponse.json(thread);
            const file = published.find((f) => f.id === itemId);
            return file ? HttpResponse.json(threadOf(itemId, file.title, [], { fileName: file.name })) : failure(404, "not_found", "Not found.");
        }),
        http.post(`${base}/comments`, async ({ request }) => {
            const body = await note(request);
            const thread = box.threads[body.itemId];
            const known = sent.get(body.clientToken);
            if (known) return HttpResponse.json(known);
            const comment = commentOf(nextCommentId(), body.itemId, me(), body.body, { mentions: body.mentions });
            if (thread) thread.comments.push(comment);
            else box.threads[body.itemId] = threadOf(body.itemId, `File ${body.itemId}`, [comment]);
            sent.set(body.clientToken, comment);
            return HttpResponse.json(comment);
        }),
        http.put(`${base}/comments/:commentId`, async ({ request, params }) => {
            const body = await note(request);
            const changed = replaceComment(Number(params.commentId), (c) => ({ ...c, body: body.body, mentions: body.mentions, editedAt: AT }));
            return changed ? HttpResponse.json(changed) : failure(404, "not_found", "Not found.");
        }),
        http.delete(`${base}/comments/:commentId`, async ({ request, params }) => {
            await note(request);
            const gone = replaceComment(Number(params.commentId), (c) => ({ ...c, body: null, deleted: true, mentions: [], canEdit: false, canDelete: false }));
            return gone ? HttpResponse.json(gone) : failure(404, "not_found", "Not found.");
        }),
        http.post(`${base}/read`, async ({ request }) => {
            const body = await note(request);
            // the markers move forward: what was seen is no longer new, and a file's comments are read on their own
            const threads = box.summary.threads.map((t) => (body.lastCommentId != null && t.itemId === body.itemId ? { ...t, unread: 0 } : t));
            box.summary = {
                ...box.summary,
                unreadMessages: body.lastMessageId != null ? 0 : box.summary.unreadMessages,
                unreadComments: body.lastCommentId != null ? threads.reduce((sum, t) => sum + t.unread, 0) : box.summary.unreadComments,
                threads,
            };
            return HttpResponse.json(box.summary);
        }),
    ];
    return { box, handlers };
}

