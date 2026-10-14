import type { ReactNode } from "react";
import { fmtDayDateY, fmtTime, relTime } from "@/shared/format/time";
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
    /** The person's own actions (Edit, Delete), at the end of the line. */
    actions?: ReactNode;
};

/** The line above something someone wrote: who, from which side, when, whether it was edited, and what they can do to it. */
export function AuthorLine({ author, createdAt, editedAt, actions }: Props) {
    return (
        <div className="dp-head">
            <span className="dp-author">{author.name}</span>
            <KindTag kind={author.kind} />
            <time className="dp-time" dateTime={createdAt} title={`${fmtDayDateY(createdAt)}, ${fmtTime(createdAt)}`}>{relTime(createdAt)}</time>
            {editedAt && <span className="dp-edited" title={`Edited ${fmtDayDateY(editedAt)}, ${fmtTime(editedAt)}`}>(edited)</span>}
            {actions && <span className="dp-actions">{actions}</span>}
        </div>
    );
}
