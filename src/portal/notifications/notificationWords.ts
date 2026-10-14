import type { PortalNotification } from "./notificationsApi";

export type PortalNotificationView = {
    text: string;
    /** The portal page it is about: a project's chat, or one of its files. */
    link: string;
};

/** The sentence and the link of a notification; the API only keeps who, where and how many. */
export function describePortalNotification(note: PortalNotification): PortalNotificationView {
    const project = `/portal/projects/${note.projectId}`;
    const chat = `${project}?chat=1`;
    const file = note.itemId == null ? project : `${project}?item=${note.itemId}`;
    const item = note.itemTitle ?? "a file";

    switch (note.kind) {
        case "team_message":
            return {
                text: note.count > 1 ? `${note.count} new messages in ${note.projectTitle}` : `${note.actorName} sent a message in ${note.projectTitle}`,
                link: chat,
            };
        case "team_comment":
            return {
                text: note.count > 1 ? `${note.count} new comments on ${item}` : `${note.actorName} commented on ${item}`,
                link: file,
            };
        case "mention":
            return {
                text: `${note.actorName} mentioned you in ${note.projectTitle}${note.itemId == null ? "" : ` on ${item}`}`,
                link: note.itemId == null ? chat : file,
            };
        default:
            // a kind this version doesn't know yet
            return { text: `New activity in ${note.projectTitle}`, link: project };
    }
}
