import { fmtDayDateY, fmtTime, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { DiscussionPerson, PersonKind } from "./discussionTypes";

/** "Client" or "Team": which side of the project someone writes from. */
export function KindTag({ kind }: { kind: PersonKind }) {
    return <span className={cx("dp-kind", kind)}>{kind === "client" ? "Client" : "Team"}</span>;
}

type Props = {
    author: DiscussionPerson;
    createdAt: string;
    editedAt: string | null;
};

/**
 * The line above something someone wrote: who, from which side, when, and whether it was edited. Your own say only
 * when (their place on the right says whose they are; a screen reader is told "You").
 */
export function AuthorLine({ author, createdAt, editedAt }: Props) {
    return (
        <div className="dp-head">
            {author.isYou ? <span className="sr">You</span> : (
                <>
                    <span className="dp-author">{author.name}</span>
                    <KindTag kind={author.kind} />
                </>
            )}
            <time className="dp-time" dateTime={createdAt} title={`${fmtDayDateY(createdAt)}, ${fmtTime(createdAt)}`}>{relTime(createdAt)}</time>
            {editedAt && <span className="dp-edited" title={`Edited ${fmtDayDateY(editedAt)}, ${fmtTime(editedAt)}`}>(edited)</span>}
        </div>
    );
}

type ConfirmProps = {
    /** "Delete this comment?" */
    question: string;
    /** The button that deletes: "Delete comment". */
    action: string;
    busy: boolean;
    /** Why the last try failed, or null. */
    failed: string | null;
    onKeep: () => void;
    onDelete: () => void;
};

/**
 * The small question before something is deleted for good, under it. The keyboard lands on Cancel: the question takes
 * the place of the menu that asked for it, which had the keyboard.
 */
export function ConfirmDelete({ question, action, busy, failed, onKeep, onDelete }: ConfirmProps) {
    return (
        <div className="dp-confirm" role="group" aria-label={question}>
            <span>{question} This can't be undone.</span>
            <span className="dp-confirm-btns">
                <button type="button" className="btn btn-sm btn-quiet" disabled={busy} autoFocus onClick={onKeep}>Cancel</button>
                <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={onDelete}>{action}</button>
            </span>
            {failed && <span className="err" role="alert"><Icon name="alert" />{failed}</span>}
        </div>
    );
}
