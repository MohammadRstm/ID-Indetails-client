import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { errorMessage, isStatus } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useAddComment, useCommentThread, useDeleteComment, useEditComment, useMarkRead, type Discussion } from "./discussionApi";
import { namesOf } from "./discussionText";
import { MAX_COMMENT, type CommentThread, type DiscussionSummary, type PortalComment } from "./discussionTypes";
import { AuthorLine } from "./DiscussionBits";
import DiscussionText from "./DiscussionText";
import MentionComposer from "./MentionComposer";
import { usePageVisible } from "./usePageVisible";

type Props = {
    discussion: Discussion;
    projectId: number;
    itemId: number;
    summary: DiscussionSummary;
    /** What the page knows of the file, for a file nobody has commented on yet (the API may have no thread to answer with). */
    fallback?: { title: string; fileName: string };
    /** The title is already on screen (the lightbox's own bar): only the file name is shown. */
    hideTitle?: boolean;
};

/** How long the thread stays on screen before its comments count as read. */
const READ_AFTER_MS = 600;

/**
 * One file's comments, oldest first, with the composer below. Your own comments can be edited and deleted (deleting asks
 * first and leaves "Comment deleted"). A file that is no longer shared, or a closed project, can only be read. Having
 * the thread on screen in a visible tab marks its comments read.
 */
export default function CommentThreadPanel({ discussion, projectId, itemId, summary, fallback, hideTitle }: Props) {
    const query = useCommentThread(discussion, projectId, itemId);
    const add = useAddComment(discussion, projectId);
    const edit = useEditComment(discussion, projectId);
    const remove = useDeleteComment(discussion, projectId);
    const { mutate: markRead } = useMarkRead(discussion, projectId);
    const visible = usePageVisible();
    const list = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

    const known = summary.threads.find((t) => t.itemId === itemId);
    // a file with no comments yet may have no thread to ask for: the page's own knowledge of the file stands in
    const thread: CommentThread | undefined = query.data
        ?? (fallback && isStatus(query.error, 404) ? { itemId, title: fallback.title, fileName: fallback.fileName, available: true, comments: [] } : undefined);
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
        const timer = setTimeout(() => markRead({ lastCommentId: newestId }), READ_AFTER_MS);
        return () => clearTimeout(timer);
    }, [unread, newestId, visible, markRead]);

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
    onSave: (draft: { body: string; mentions: string[] }) => Promise<unknown>;
    onAskDelete: () => void;
    onKeep: () => void;
    onDelete: () => void;
};

/** One comment: who, when, which version of the file it is about, its text, and Edit and Delete on your own. */
function CommentRow({ comment, summary, editing, deleting, deleteFailed, deleteBusy, onEdit, onCancelEdit, onSave, onAskDelete, onKeep, onDelete }: RowProps) {
    const busy = editing || deleting;
    const actions = !comment.deleted && !busy && (comment.canEdit || comment.canDelete) && (
        <>
            {comment.canEdit && <button type="button" className="dp-act" onClick={onEdit}>Edit</button>}
            {comment.canDelete && <button type="button" className="dp-act" onClick={onAskDelete}>Delete</button>}
        </>
    );

    return (
        <li className={cx("dp-msg", comment.author.isYou && "mine", comment.deleted && "gone")}>
            <AuthorLine author={comment.author} createdAt={comment.createdAt} editedAt={comment.editedAt} actions={actions} />
            {comment.onEarlierVersion && <div className="dp-version">On an earlier version ({comment.fileName})</div>}
            {comment.deleted || comment.body == null ? (
                <p className="dp-deleted">Comment deleted</p>
            ) : editing ? (
                <MentionComposer label="Edit comment" max={MAX_COMMENT} people={summary.participants} closed={null}
                    initial={{ body: comment.body, mentions: comment.mentions }} submitLabel="Save" focusOnOpen
                    onSubmit={onSave} onCancel={onCancelEdit} />
            ) : (
                <DiscussionText text={comment.body} names={namesOf(comment.mentions, summary.participants)} />
            )}
            {deleting && (
                <div className="dp-confirm" role="group" aria-label="Delete this comment?">
                    <span>Delete this comment? This can't be undone.</span>
                    <span className="dp-confirm-btns">
                        <button type="button" className="btn btn-sm btn-quiet" disabled={deleteBusy} onClick={onKeep}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-danger" disabled={deleteBusy} onClick={onDelete}>Delete comment</button>
                    </span>
                    {deleteFailed && <span className="err" role="alert"><Icon name="alert" />{deleteFailed}</span>}
                </div>
            )}
        </li>
    );
}
