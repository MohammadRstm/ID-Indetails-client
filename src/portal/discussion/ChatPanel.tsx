import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useChatMessages, useEditMessage, useMarkRead, useSendMessage, type Discussion } from "./discussionApi";
import { namesOf } from "./textParts";
import { MAX_MESSAGE, type DiscussionSummary, type PortalChatMessage } from "./discussionTypes";
import { AuthorLine } from "./DiscussionBits";
import DiscussionText from "./DiscussionText";
import MentionComposer from "./MentionComposer";
import { usePageVisible } from "./usePageVisible";

type Props = {
    discussion: Discussion;
    projectId: number;
    summary: DiscussionSummary;
};

/** How far from the end the list may be and still count as at the end (pixels). */
const NEAR_END = 48;
/** How long the newest message stays on screen before it counts as read. */
const READ_AFTER_MS = 600;

/**
 * A project's chat, for the client and the team alike: the messages oldest first with "Load earlier messages" above,
 * and the composer below. The list follows new messages while you are at the end; if you are reading further up, a
 * "New messages" button says so instead. Having the newest message on screen in a visible tab marks the chat read.
 */
export default function ChatPanel({ discussion, projectId, summary }: Props) {
    const messages = useChatMessages(discussion, projectId);
    const send = useSendMessage(discussion, projectId);
    const edit = useEditMessage(discussion, projectId);
    const { mutate: markRead } = useMarkRead(discussion, projectId);
    const visible = usePageVisible();
    const list = useRef<HTMLDivElement>(null);
    // the distance from the end the list had when older messages were asked for: it is kept when they arrive above
    const anchor = useRef<number | null>(null);
    const [atEnd, setAtEnd] = useState(true);
    const [seenId, setSeenId] = useState(0);
    const [editing, setEditing] = useState<number | null>(null);

    const shown = [...(messages.data?.pages ?? [])].reverse().flatMap((page) => page.messages);
    const oldestId = shown[0]?.id ?? 0;
    const newest = shown[shown.length - 1];
    const newestId = newest?.id ?? 0;
    const newestIsYours = newest?.author.isYou ?? false;
    const unread = summary.unreadMessages;

    // what is on screen at the end is seen
    if (atEnd && seenId !== newestId) setSeenId(newestId);
    const hasNew = !atEnd && newestId > seenId;

    // a new newest message: the list goes to it, if the reader was at the end or wrote it
    const follow = useEffectEvent(() => {
        const box = list.current;
        if (box && (atEnd || newestIsYours)) box.scrollTop = box.scrollHeight;
    });
    useLayoutEffect(() => {
        follow();
    }, [newestId]);

    // older messages arrived above: what was being read stays where it was
    useLayoutEffect(() => {
        const box = list.current;
        if (!box || anchor.current == null) return;
        box.scrollTop = box.scrollHeight - anchor.current;
        anchor.current = null;
    }, [oldestId]);

    // the newest message on screen, in a tab being looked at: read, a moment later
    useEffect(() => {
        if (unread === 0 || newestId === 0 || !atEnd || !visible) return;
        const timer = setTimeout(() => markRead({ lastMessageId: newestId }), READ_AFTER_MS);
        return () => clearTimeout(timer);
    }, [unread, newestId, atEnd, visible, markRead]);

    function onScroll() {
        const box = list.current;
        if (box) setAtEnd(box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_END);
    }

    function loadEarlier() {
        const box = list.current;
        if (box) anchor.current = box.scrollHeight - box.scrollTop;
        void messages.fetchNextPage();
    }

    function jumpToEnd() {
        const box = list.current;
        if (box) box.scrollTop = box.scrollHeight;
        setAtEnd(true);
    }

    const closed = summary.canWrite ? null : (summary.closedReason ?? "This project is closed. You can read the messages but not add to them.");
    const client = discussion.side === "client";

    return (
        <div className="dp-chat">
            <div className="dp-list" ref={list} onScroll={onScroll} role="log" aria-label="Messages">
                {loadFailed(messages) ? (
                    <LoadError error={messages.error} what="the messages" retry={() => void messages.refetch()} />
                ) : !messages.data ? (
                    <SkeletonLines lines={6} />
                ) : (
                    <>
                        {messages.hasNextPage && (
                            <div className="dp-earlier">
                                <button type="button" className="btn btn-sm btn-quiet" disabled={messages.isFetchingNextPage} onClick={loadEarlier}>
                                    {messages.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
                                </button>
                            </div>
                        )}
                        {shown.length === 0 ? (
                            <p className="dp-empty">{client ? "No messages yet. Say hello to your project team." : "No messages yet."}</p>
                        ) : (
                            <ul className="dp-msgs">
                                {shown.map((message) => (
                                    <MessageRow key={message.id} message={message} summary={summary}
                                        editing={editing === message.id}
                                        onEdit={() => setEditing(message.id)}
                                        onCancel={() => setEditing(null)}
                                        onSave={async (draft) => {
                                            await edit.mutateAsync({ messageId: message.id, ...draft });
                                            setEditing(null);
                                        }} />
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
            {hasNew && (
                <button type="button" className="dp-newpill" onClick={jumpToEnd}><Icon name="arrowDown" />New messages</button>
            )}
            <div className="dp-foot">
                <MentionComposer label="Message" placeholder="Write a message. Type @ to mention someone." max={MAX_MESSAGE}
                    people={summary.participants} closed={closed}
                    onSubmit={async (draft) => { await send.mutateAsync(draft); }} />
            </div>
        </div>
    );
}

type RowProps = {
    message: PortalChatMessage;
    summary: DiscussionSummary;
    editing: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: (draft: { body: string; mentions: string[] }) => Promise<unknown>;
};

/** One message: who wrote it and when, its text (or the box it is edited in), and Edit on your own. */
function MessageRow({ message, summary, editing, onEdit, onCancel, onSave }: RowProps) {
    return (
        <li className={cx("dp-msg", message.author.isYou && "mine")}>
            <AuthorLine author={message.author} createdAt={message.createdAt} editedAt={message.editedAt}
                actions={message.canEdit && !editing && <button type="button" className="dp-act" onClick={onEdit}>Edit</button>} />
            {editing ? (
                <MentionComposer label="Edit message" max={MAX_MESSAGE} people={summary.participants} closed={null}
                    initial={{ body: message.body, mentions: message.mentions }} submitLabel="Save" focusOnOpen
                    onSubmit={onSave} onCancel={onCancel} />
            ) : (
                <DiscussionText text={message.body} names={namesOf(message.mentions, summary.participants)} />
            )}
        </li>
    );
}
