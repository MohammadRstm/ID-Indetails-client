import { useState, type ReactNode } from "react";
import { z } from "zod";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import DiscussionText from "@/portal/discussion/DiscussionText";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import { Drawer } from "@/shared/components/Overlays/Modal";
import { fmtDayDateY, fmtTime, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { COMMENT_MAX, useAddComment, useDeleteComment, useEditComment, useFileComments, useFixComment, useProjectFiles, type FileComment } from "./filesApi";

const TOO_LONG = `Use at most ${COMMENT_MAX} characters.`;
const schema = z.object({ body: z.string().trim().min(1, "Write a comment first.").max(COMMENT_MAX, TOO_LONG) });

const exactly = (instant: string) => `${fmtDayDateY(instant)}, ${fmtTime(instant)}`;

type Props = { projectId: number; itemId: number; onClose: () => void };

/**
 * A file's comments, in a panel beside the Project files tab (?comments={itemId}): oldest first, with the fixed ones
 * folded away. A project_files:manage holder starts the comments on a file; anyone else replies once there are some.
 * Your own can be edited and deleted; the file's uploader and the managers mark them fixed, or open them again. An
 * archived project's comments can only be read.
 */
export default function FileComments({ projectId, itemId, onClose }: Props) {
    const files = useProjectFiles(projectId).data;
    const item = files?.items.find((i) => i.id === itemId);
    const query = useFileComments(projectId, itemId);
    const add = useAddComment(projectId, itemId);
    const [showFixed, setShowFixed] = useState(false);
    const comments = query.data ?? [];
    const open = comments.filter((c) => c.fixedAt == null);
    const fixed = comments.filter((c) => c.fixedAt != null);
    // an archived project's comments are only read
    const writable = files?.canEdit ?? false;

    let foot: ReactNode = null;
    if (files && query.data) {
        foot = !files.canEdit ? <Note text={files.readOnlyReason ?? "This project's comments can only be read."} />
            : !files.canManage && comments.length === 0 ? <Note text="Only admins start comments on a file." />
                : <CommentForm id="pf-comment" label="Add a comment" submitLabel="Send" onSubmit={(body) => add.mutateAsync(body)} />;
    }

    const row = (comment: FileComment) => <CommentRow key={comment.id} projectId={projectId} itemId={itemId} comment={comment} writable={writable} />;

    return (
        <Drawer surfaceId="file_comments" title={item ? `Comments on ${item.title}` : "Comments"} onClose={onClose}
            head={
                <div>
                    <div className="modal-title">Comments</div>
                    {item && <div className="modal-sub">{item.title}</div>}
                </div>
            }
            foot={foot && <div className="pf-foot">{foot}</div>}>
            {loadFailed(query) ? (
                <LoadError error={query.error} what="the comments" retry={() => void query.refetch()} />
            ) : !query.data ? (
                <SkeletonLines lines={4} />
            ) : comments.length === 0 ? (
                <p className="dp-empty">No comments yet.</p>
            ) : (
                <>
                    {open.length > 0 ? <ul className="dp-msgs">{open.map(row)}</ul> : <p className="dp-empty">Every comment is fixed.</p>}
                    {fixed.length > 0 && (
                        <div className="pf-fixed">
                            <button type="button" className="btn btn-sm btn-quiet" aria-expanded={showFixed} onClick={() => setShowFixed(!showFixed)}>
                                <Icon name={showFixed ? "chevronUp" : "chevronDown"} />{showFixed ? `Hide ${fixed.length} fixed` : `Show ${fixed.length} fixed`}
                            </button>
                            {showFixed && <ul className="dp-msgs">{fixed.map(row)}</ul>}
                        </div>
                    )}
                </>
            )}
        </Drawer>
    );
}

/** Why the box isn't there: in its place. */
function Note({ text }: { text: string }) {
    return <div className="dp-closed" role="status"><Icon name="lock" /><span>{text}</span></div>;
}

type RowProps = { projectId: number; itemId: number; comment: FileComment; writable: boolean };

/** One comment: who and when, whether it was edited or fixed, its text, and what the person may do with it. */
function CommentRow({ projectId, itemId, comment, writable }: RowProps) {
    const edit = useEditComment(projectId, itemId);
    const remove = useDeleteComment(projectId, itemId);
    const fix = useFixComment(projectId, itemId);
    const [doing, setDoing] = useState<"edit" | "delete" | null>(null);
    const canEdit = writable && comment.canEdit;
    const canDelete = writable && comment.canDelete;
    const canFix = writable && comment.canFix;
    const isFixed = comment.fixedAt != null;

    async function toggleFixed() {
        try {
            await fix.mutateAsync({ commentId: comment.id, fixed: !isFixed });
        } catch (error) {
            toast({ text: isFixed ? "The comment wasn't reopened" : "The comment wasn't marked fixed", sub: errorMessage(error), icon: "alert" });
        }
    }

    async function confirmDelete() {
        try {
            await remove.mutateAsync(comment.id);
        } catch {
            // the reason shows with the question
        }
    }

    return (
        <li className={cx("dp-msg", comment.canEdit && "mine", isFixed && "fixed")}>
            <div className="dp-head">
                <span className="dp-author">{comment.author.name}</span>
                <time className="dp-time" dateTime={comment.createdAt} title={exactly(comment.createdAt)}>{relTime(comment.createdAt)}</time>
                {comment.editedAt && <span className="dp-edited" title={`Edited ${exactly(comment.editedAt)}`}>(edited)</span>}
                {doing == null && (canFix || canEdit || canDelete) && (
                    <span className="dp-actions">
                        {canFix && <button type="button" className="dp-act" disabled={fix.isPending} onClick={() => void toggleFixed()}>{isFixed ? "Reopen" : "Mark fixed"}</button>}
                        {canEdit && <button type="button" className="dp-act" onClick={() => setDoing("edit")}>Edit</button>}
                        {canDelete && <button type="button" className="dp-act" onClick={() => { remove.reset(); setDoing("delete"); }}>Delete</button>}
                    </span>
                )}
            </div>
            {doing === "edit" && canEdit ? (
                <CommentForm id={`pf-comment-${comment.id}`} label="Edit comment" initial={comment.body} submitLabel="Save"
                    onSubmit={async (body) => {
                        await edit.mutateAsync({ commentId: comment.id, body });
                        setDoing(null);
                    }}
                    onCancel={() => setDoing(null)} />
            ) : (
                <DiscussionText text={comment.body} names={[]} />
            )}
            {comment.fixedAt && (
                <div className="pf-fixed-by"><Icon name="checkCircle" />Fixed{comment.fixedBy ? ` by ${comment.fixedBy.name}` : ""} · {relTime(comment.fixedAt)}</div>
            )}
            {doing === "delete" && canDelete && (
                <div className="dp-confirm" role="group" aria-label="Delete this comment?">
                    <span>Delete this comment? This can't be undone.</span>
                    <span className="dp-confirm-btns">
                        <button type="button" className="btn btn-sm btn-quiet" disabled={remove.isPending} onClick={() => setDoing(null)}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-danger" disabled={remove.isPending} onClick={() => void confirmDelete()}>Delete comment</button>
                    </span>
                    {remove.isError && <span className="err" role="alert"><Icon name="alert" />{errorMessage(remove.error)}</span>}
                </div>
            )}
        </li>
    );
}

type FormProps = {
    id: string;
    label: string;
    /** Editing a comment: its text. */
    initial?: string;
    submitLabel: string;
    onSubmit: (body: string) => Promise<unknown>;
    onCancel?: () => void;
};

/**
 * A comment's box, with the count against the limit. Too long is said as it is typed; an empty box when it is sent.
 * What the API refuses is said under it, and the words stay.
 */
function CommentForm({ id, label, initial = "", submitLabel, onSubmit, onCancel }: FormProps) {
    const form = useForm({ body: initial }, schema);
    const [busy, setBusy] = useState(false);
    const text = form.values.body;
    const length = text.trim().length;
    const error = form.errors.body ?? (length > COMMENT_MAX ? TOO_LONG : undefined);

    async function submit() {
        if (busy || !form.validate()) return;
        const body = text.trim();
        // nothing was changed: an edit is simply closed
        if (initial && body === initial.trim()) return onCancel?.();
        setBusy(true);
        try {
            await onSubmit(body);
            if (!initial) form.set("body", "");
        } catch (failure) {
            form.fail(failure);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form className="pf-form" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <Field id={id} label={label} error={error}>
                <textarea id={id} className={cx("textarea dp-input", error && "bad")} rows={3} value={text} autoFocus={initial !== ""}
                    aria-invalid={error ? true : undefined} aria-describedby={`${id}-count`} onChange={(e) => form.set("body", e.target.value)} />
            </Field>
            <FieldError message={form.errors.form} />
            <div className="dp-composer-foot">
                <span id={`${id}-count`} className={cx("dp-count", length > COMMENT_MAX && "over")}>{length} / {COMMENT_MAX}</span>
                <span className="grow" />
                {onCancel && <button type="button" className="btn btn-sm btn-quiet" onClick={onCancel}>Cancel</button>}
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}><Icon name={initial ? "check" : "send"} />{submitLabel}</button>
            </div>
        </form>
    );
}
