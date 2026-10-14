import { Badge } from "@/shared/components/Data/Pills";
import { relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { CommentThreadSummary } from "./discussionTypes";

type Props = {
    threads: CommentThreadSummary[];
    onOpen: (itemId: number) => void;
};

/** Every file that has comments, newest activity first: its title and file name, how many comments, which are new and when. */
export default function CommentThreadsList({ threads, onOpen }: Props) {
    if (threads.length === 0) return <p className="dp-empty">No comments on files yet.</p>;
    return (
        <ul className="dp-threads">
            {threads.map((thread) => (
                <li key={thread.itemId}>
                    <button type="button" className="dp-trow" onClick={() => onOpen(thread.itemId)}>
                        <span className="dp-trow-main">
                            <span className="dp-trow-title trunc">{thread.title}</span>
                            <span className="dp-trow-file trunc muted">{thread.fileName}</span>
                        </span>
                        <span className="dp-trow-meta">
                            {!thread.available && <Badge icon="lock">No longer shared</Badge>}
                            <span className="muted">{relTime(thread.lastAt)}</span>
                            <span className="dp-chip" title={thread.count === 1 ? "1 comment" : `${thread.count} comments`}><Icon name="chat" />{thread.count}</span>
                            {thread.unread > 0 && <span className="dp-unread">{thread.unread} new</span>}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}
