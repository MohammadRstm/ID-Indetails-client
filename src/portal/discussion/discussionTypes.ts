/*
 * The project discussion's shapes (PHASE4-CONTRACT.md): the chat, the comments on files and who takes part. The same JSON
 * comes from the staff API and from the client's, so one set of screens serves both.
 */

export type PersonKind = "staff" | "client";

/** key: "u{id}" for staff, "c{id}" for clients. It is what a mention names. */
export type DiscussionPerson = { key: string; name: string; kind: PersonKind; isYou: boolean };

export type CommentThreadSummary = {
    itemId: number;
    /** The file's title as it was last commented on (or now). */
    title: string;
    fileName: string;
    /** False: the file is no longer shared, and the thread can only be read. */
    available: boolean;
    /** Comments, deleted ones included. */
    count: number;
    /** Comments by others after your read marker. */
    unread: number;
    lastAt: string;
};

export type DiscussionSummary = {
    projectId: number;
    /** False when the project is archived. */
    canWrite: boolean;
    closedReason: string | null;
    unreadMessages: number;
    unreadComments: number;
    lastMessageId: number | null;
    lastCommentId: number | null;
    /** Who is in the discussion; the @mention list. */
    participants: DiscussionPerson[];
    /** Every file that has comments, newest activity first. */
    threads: CommentThreadSummary[];
};

export type PortalChatMessage = {
    id: number;
    author: DiscussionPerson;
    body: string;
    /** Person keys mentioned. */
    mentions: string[];
    createdAt: string;
    editedAt: string | null;
    /** Yours, and the project isn't archived. */
    canEdit: boolean;
};

/** Oldest first within the page. */
export type MessagePage = { messages: PortalChatMessage[]; hasMore: boolean };

export type PortalComment = {
    id: number;
    itemId: number;
    author: DiscussionPerson;
    /** Null once deleted. */
    body: string | null;
    deleted: boolean;
    mentions: string[];
    /** The file version it was written about. */
    fileName: string;
    /** The file was replaced since. */
    onEarlierVersion: boolean;
    createdAt: string;
    editedAt: string | null;
    canEdit: boolean;
    canDelete: boolean;
};

/** Comments oldest first. */
export type CommentThread = { itemId: number; title: string; fileName: string; available: boolean; comments: PortalComment[] };

/** What a person has written, as it is sent: the text and the keys of the people it names. */
export type Draft = { body: string; mentions: string[] };

/** Longest chat message and longest comment, after trimming. */
export const MAX_MESSAGE = 4000;
export const MAX_COMMENT = 2000;
