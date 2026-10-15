import type { PortalProject } from "./portalApi";

/*
 * What the client portal's tests share about the client's projects.
 */

/** A project shared with the client, as the API lists it: started on 1 September, with no cover, nothing new and nothing unread unless a test says otherwise. */
export const portalProjectOf = (id: number, title: string, over: Partial<PortalProject> = {}): PortalProject => ({
    id, title, status: "active", unread: 0, heroUrl: null, heroUrlExpiresAt: null, startedOn: "2026-09-01",
    lastPublishedAt: null, lastActivityAt: null, hasNews: false, ...over,
});
