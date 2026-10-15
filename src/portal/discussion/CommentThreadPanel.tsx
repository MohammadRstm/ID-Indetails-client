import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { errorMessage, isStatus } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import BubbleRow, { type RowAction } from "./BubbleRow";
import { useAddComment, useCommentThread, useDeleteComment, useEditComment, useMarkRead, type Discussion } from "./discussionApi";
import { mentionNames } from "./textParts";
import { MAX_COMMENT, type CommentThread, type DiscussionSummary, type Draft, type PortalComment } from "./discussionTypes";
import { ConfirmDelete } from "./DiscussionBits";
import DiscussionText from "./DiscussionText";
import MentionComposer from "./MentionComposer";
import { usePageVisible } from "./usePageVisible";
import { usePassWheelToPage } from "./usePassWheelToPage";

type Props = {
    discussion: Discussion;
    projectId: number;
    itemId: number;
    summary: DiscussionSummary;
    /** What the page knows of the file, for when the API has no thread to answer with (a file no longer shared, with no comments). */
    fallback?: { title: string; fileName: string };
    /** The title is already on screen (the lightbox's own bar): only the file name is shown. */
    hideTitle?: boolean;
};

/** How long the thread stays on screen before its comments count as read. */
const READ_AFTER_MS = 600;

/**
 * One file's comments, oldest first, with the composer below. Your own comments are on the right; their menu edits them,
 * or deletes them (asking first, and leaving "Comment deleted"). A file that is no longer shared, or a closed project,
 * can only be read. Having the thread on screen in a visible tab marks its comments read.
 */
export default function CommentThreadPanel({ discussion, projectId, itemId, summary, fallback, hideTitle }: Props) {
    const query = useCommentThread(discussion, projectId, itemId);
    const add = useAddComment(discussion, projectId);
    const edit = useEditComment(discussion, projectId);
    const remove = useDeleteComment(discussion, projectId);
    const { mutate: markRead } = useMarkRead(discussion, projectId);
    const visible = usePageVisible();
    const list = useRef<HTMLDivElement>(null);
    usePassWheelToPage(list);
    const [editing, setEditing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

    const known = summary.threads.find((t) => t.itemId === itemId);
    // A shared file nobody has commented on has an empty thread; the API answers 404 only for a file that is no longer
    // shared and has no comments. The page's own knowledge of the file stands in for it, and it can only be read.
    const thread: CommentThread | undefined = query.data
        ?? (fallback && isStatus(query.error, 404) ? { itemId, title: fallback.title, fileName: fallback.fileName, available: false, comments: [] } : undefined);
    const comments = thread?.comments ?? [];
    const newestId = comments.reduce((newest, c) => Math.max(newest, c.id), 0);
    const unread = known?.unread ?? 0;

    // the newest comment is the one in view
    useLayoutEffect(() => {
        const box = list.current;
        if (box) box.scrollTop = box.scrollHeight;
    }, [comments.length]);

    useEffect(() => {
        if (unread === 0 || newestId === 0 || !visible) return;
        const timer = setTimeout(() => markRead({ itemId, lastCommentId: newestId }), READ_AFTER_MS);
        return () => clearTimeout(timer);
    }, [unread, itemId, newestId, visible, markRead]);

    const title = thread?.title ?? known?.title ?? fallback?.title ?? "";
    const fileName = thread?.fileName ?? known?.fileName ?? fallback?.fileName ?? "";
    const closed = !thread ? null
        : !thread.available ? "This file is no longer shared"
            : summary.canWrite ? null : (summary.closedReason ?? "This project is closed. You can read the comments but not add to them.");

    return (
        <div className="dp-chat dp-thread">
            <div className="dp-thread-head">
                {!hideTitle && title && <h3 className="dp-thread-title">{title}</h3>}
                {fileName && <div className="dp-thread-file muted">{fileName}</div>}
                {thread && !thread.available && <div className="dp-gone"><Icon name="lock" />No longer shared</div>}
            </div>
            <div className="dp-list" ref={list} role="log" aria-label="Comments">
                {!thread && loadFailed(query) ? (
                    <LoadError error={query.error} what="the comments" retry={() => void query.refetch()} />
                ) : !thread ? (
                    <SkeletonLines lines={5} />
                ) : comments.length === 0 ? (
                    <p className="dp-empty">No comments yet.</p>
                ) : (
                    <ul className="dp-msgs">
                        {comments.map((comment) => (
                            <CommentRow key={comment.id} comment={comment} summary={summary}
                                editing={editing === comment.id} deleting={deleting === comment.id}
                                deleteFailed={deleting === comment.id && remove.isError ? errorMessage(remove.error) : null}
                                deleteBusy={remove.isPending}
                                onEdit={() => { setDeleting(null); setEditing(comment.id); }}
                                onCancelEdit={() => setEditing(null)}
                                onSave={async (draft) => {
                                    await edit.mutateAsync({ commentId: comment.id, ...draft });
                                    setEditing(null);
                                }}
                                onAskDelete={() => { remove.reset(); setEditing(null); setDeleting(comment.id); }}
                                onKeep={() => setDeleting(null)}
                                onDelete={async () => {
                                    try {
                                        await remove.mutateAsync(comment.id);
                                        setDeleting(null);
                                    } catch {
                                        // the reason shows with the question
                                    }
                                }} />
                        ))}
                    </ul>
                )}
            </div>
            <div className="dp-foot">
                <MentionComposer label="Comment" placeholder="Write a comment. Type @ to mention someone." max={MAX_COMMENT}
                    people={summary.participants} closed={closed}
                    onSubmit={async (draft) => { await add.mutateAsync({ itemId, ...draft }); }} />
            </div>
        </div>
    );
}

type RowProps = {
    comment: PortalComment;
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

/** One comment as a bubble: which version of the file it is about, its text, and on your own the menu to edit or delete it. */
function CommentRow({ comment, summary, editing: editOpen, deleting: deleteOpen, deleteFailed, deleteBusy, onEdit, onCancelEdit, onSave, onAskDelete, onKeep, onDelete }: RowProps) {
    // a project closed meanwhile (an edit refused, the summary asked again) takes Edit and Delete away, open or not
    const gone = comment.deleted || comment.body == null;
    const canEdit = comment.canEdit && !gone && summary.canWrite;
    const canDelete = comment.canDelete && !gone && summary.canWrite;
    const editing = editOpen && canEdit;
    const deleting = deleteOpen && canDelete;
    const actions: RowAction[] = editing || deleting ? [] : [
        ...(canEdit ? [{ label: "Edit", icon: "edit" as const, onSelect: onEdit }] : []),
        ...(canDelete ? [{ label: "Delete comment", icon: "trash" as const, danger: true, onSelect: onAskDelete }] : []),
    ];

    return (
        <BubbleRow author={comment.author} createdAt={comment.createdAt} editedAt={comment.editedAt} menuLabel="Comment actions" actions={actions}
            className={gone ? "gone" : undefined}
            note={comment.onEarlierVersion && <div className="dp-version">On an earlier version ({comment.fileName})</div>}
            editor={editing && comment.body != null ? (
                <MentionComposer label="Edit comment" max={MAX_COMMENT} people={summary.participants} closed={null}
                    initial={{ body: comment.body, mentions: comment.mentions }} submitLabel="Save" focusOnOpen
                    onSubmit={onSave} onCancel={onCancelEdit} />
            ) : undefined}
            after={deleting && (
                <ConfirmDelete question="Delete this comment?" action="Delete comment" busy={deleteBusy} failed={deleteFailed}
                    onKeep={onKeep} onDelete={onDelete} />
            )}>
            {gone || comment.body == null
                ? <p className="dp-deleted">Comment deleted</p>
                : <DiscussionText text={comment.body} names={mentionNames(comment.mentions, summary.participants)} />}
        </BubbleRow>
    );
}
