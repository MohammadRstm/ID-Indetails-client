import { cx } from "@/shared/utils/cx";
import { textParts } from "./textParts";

type Props = {
    text: string;
    /** The names of the people mentioned: their "@Name" stands out. */
    names: string[];
    className?: string;
};

/**
 * What someone wrote, as plain text: React draws it escaped, so a "<b>" stays the characters it is. https: links become
 * links, and the "@Name" of the people mentioned is a pill.
 */
export default function DiscussionText({ text, names, className }: Props) {
    return (
        <p className={cx("dp-text", className)}>
            {textParts(text, names).map((part, i) =>
                part.kind === "mention" ? <span key={i} className="dp-mention">{part.text}</span>
                    : part.kind === "link" ? <a key={i} href={part.text} target="_blank" rel="noopener noreferrer">{part.text}</a>
                        : part.text)}
        </p>
    );
}
