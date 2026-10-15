import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import BubbleRow, { type RowAction } from "./BubbleRow";
import { useChatMessages, useDeleteMessage, useEditMessage, useMarkRead, useSendMessage, type Discussion } from "./discussionApi";
import { mentionNames } from "./textParts";
import { MAX_MESSAGE, type DiscussionSummary, type Draft, type PortalChatMessage } from "./discussionTypes";
import { ConfirmDelete } from "./DiscussionBits";
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
 * and the composer below. Your own messages are on the right; their menu edits them, or deletes them for everyone
 * (asking first). The list follows new messages while you are at the end; if you are reading further up, a "New
 * messages" button says so instead. Having the newest message on screen in a visible tab marks the chat read.
 */
export default function ChatPanel({ discussion, projectId, summary }: Props) {
    const messages = useChatMessages(discussion, projectId);
    const send = useSendMessage(discussion, projectId);
    const edit = useEditMessage(discussion, projectId);
    const remove = useDeleteMessage(discussion, projectId);
    const { mutate: markRead } = useMarkRead(discussion, projectId);
    const visible = usePageVisible();
    const list = useRef<HTMLDivElement>(null);
    // the distance from the end the list had when older messages were asked for: it is kept when they arrive above
    const anchor = useRef<number | null>(null);
    const [atEnd, setAtEnd] = useState(true);
    const [seenId, setSeenId] = useState(0);
    const [editing, setEditing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

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
                                        editing={editing === message.id} deleting={deleting === message.id}
                                        deleteFailed={deleting === message.id && remove.isError ? errorMessage(remove.error) : null}
                                        deleteBusy={remove.isPending}
                                        onEdit={() => { setDeleting(null); setEditing(message.id); }}
                                        onCancelEdit={() => setEditing(null)}
                                        onSave={async (draft) => {
                                            await edit.mutateAsync({ messageId: message.id, ...draft });
                                            setEditing(null);
                                        }}
                                        onAskDelete={() => { remove.reset(); setEditing(null); setDeleting(message.id); }}
                                        onKeep={() => setDeleting(null)}
                                        onDelete={async () => {
                                            try {
                                                await remove.mutateAsync(message.id);
                                                setDeleting(null);
                                            } catch {
                                                // the reason shows with the question
                                            }
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
    deleting: boolean;
    deleteFailed: string | null;
    deleteBusy: boolean;
    onEdit: () => void;
    onCancelEdit: () => void;
    onSave: (draft: Draft) => Promise<unknown>;
    onAskDelete: () => void;
    onKeep: () => void;
    onDelete: () => void;
};

/** One message as a bubble: its text (or the box it is edited in), and on your own the menu to edit or delete it. */
function MessageRow({ message, summary, editing: editOpen, deleting: deleteOpen, deleteFailed, deleteBusy, onEdit, onCancelEdit, onSave, onAskDelete, onKeep, onDelete }: RowProps) {
    // a project closed meanwhile (an edit refused, the summary asked again) takes Edit and Delete away, open or not
    const canChange = message.canEdit && !message.deleted && message.body != null && summary.canWrite;
    const editing = editOpen && canChange;
    const deleting = deleteOpen && canChange;
    const actions: RowAction[] = canChange && !editing && !deleting ? [
        { label: "Edit", icon: "edit", onSelect: onEdit },
        { label: "Delete message for everyone", icon: "trash", danger: true, onSelect: onAskDelete },
    ] : [];

    return (
        <BubbleRow author={message.author} createdAt={message.createdAt} editedAt={message.editedAt} menuLabel="Message actions" actions={actions}
            className={message.deleted ? "gone" : undefined}
            editor={editing && message.body != null ? (
                <MentionComposer label="Edit message" max={MAX_MESSAGE} people={summary.participants} closed={null}
                    initial={{ body: message.body, mentions: message.mentions }} submitLabel="Save" focusOnOpen
                    onSubmit={onSave} onCancel={onCancelEdit} />
            ) : undefined}
            after={deleting && (
                <ConfirmDelete question="Delete this message for everyone?" action="Delete for everyone" busy={deleteBusy} failed={deleteFailed}
                    onKeep={onKeep} onDelete={onDelete} />
            )}>
            {message.deleted || message.body == null
                ? <p className="dp-deleted">This message was deleted</p>
                : <DiscussionText text={message.body} names={mentionNames(message.mentions, summary.participants)} />}
        </BubbleRow>
    );
}
