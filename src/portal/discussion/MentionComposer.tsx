import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { errorMessage } from "@/api/errors";
import { FieldError } from "@/shared/components/Forms/Field";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { mentionAt, mentionCandidates, namesPerson } from "./discussionText";
import type { DiscussionPerson, Draft } from "./discussionTypes";

type Props = {
    /** The box's name for screen readers: "Message", "Comment", "Edit message". */
    label: string;
    placeholder?: string;
    /** The longest text that can be sent, after trimming. */
    max: number;
    /** Who takes part: "@" offers them (not you). */
    people: DiscussionPerson[];
    /** Why nothing can be written (a closed project, a file no longer shared). The note takes the box's place. */
    closed: string | null;
    /** Editing something already written: its text and the people it names. */
    initial?: Draft;
    submitLabel?: string;
    /** Sends it. A rejection is shown under the box with Retry, and what was written stays. */
    onSubmit: (draft: Draft) => Promise<unknown>;
    /** Gives up an edit (the Cancel button and Escape). */
    onCancel?: () => void;
    focusOnOpen?: boolean;
};

/**
 * Writing a chat message or a comment: a box with "@" to mention someone who takes part, a count against the limit and
 * Send. Enter sends and Shift+Enter starts a new line. While the picker is open the arrow keys choose, Enter or Tab
 * picks and Escape closes it. A send that fails keeps the words and offers Retry, which sends them again as the same
 * message (the hooks keep its clientToken).
 */
export default function MentionComposer({ label, placeholder, max, people, closed, initial, submitLabel = "Send", onSubmit, onCancel, focusOnOpen }: Props) {
    const [text, setText] = useState(initial?.body ?? "");
    const [caret, setCaret] = useState(initial?.body.length ?? 0);
    // the people picked from the list; the ones whose @Name is still in the text are sent
    const [picked, setPicked] = useState(() => people.filter((p) => initial?.mentions.includes(p.key)));
    const [listOpen, setListOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<unknown>(null);
    // Send was pressed with nothing written: the box says so, until something is sent
    const [attempted, setAttempted] = useState(false);
    const area = useRef<HTMLTextAreaElement>(null);
    const caretTo = useRef<number | null>(null);
    const listId = useId();

    const trimmed = text.trim();
    const empty = trimmed.length === 0;
    const tooLong = trimmed.length > max;
    const mention = mentionAt(text, caret);
    const candidates = listOpen && mention ? mentionCandidates(people, mention.query) : [];
    const chosen = Math.min(active, candidates.length - 1);
    const over = trimmed.length - max;
    const problem = tooLong ? `Too long by ${over} character${over === 1 ? "" : "s"}. Shorten it to send.` : attempted && empty ? "Write something to send." : undefined;

    // after "@Name " is put in, the caret goes behind it
    useLayoutEffect(() => {
        const to = caretTo.current;
        if (to == null || !area.current) return;
        caretTo.current = null;
        area.current.setSelectionRange(to, to);
    }, [text]);

    useEffect(() => {
        const box = area.current;
        if (!focusOnOpen || !box) return;
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
    }, [focusOnOpen]);

    if (closed) {
        return <div className="dp-closed" role="status"><Icon name="lock" /><span>{closed}</span></div>;
    }

    function change(e: ChangeEvent<HTMLTextAreaElement>) {
        setText(e.target.value);
        setCaret(e.target.selectionStart);
        setListOpen(true);
        setActive(0);
        setFailure(null);
    }

    function pick(person: DiscussionPerson) {
        if (!mention) return;
        const inserted = `@${person.name} `;
        setText(text.slice(0, mention.start) + inserted + text.slice(caret));
        setPicked((list) => (list.some((p) => p.key === person.key) ? list : [...list, person]));
        setCaret(mention.start + inserted.length);
        caretTo.current = mention.start + inserted.length;
        setListOpen(false);
    }

    async function send() {
        if (busy) return;
        if (empty) return setAttempted(true);
        if (tooLong) return;
        // nothing was changed: an edit is simply closed
        if (initial && trimmed === initial.body.trim()) return onCancel?.();
        setBusy(true);
        setFailure(null);
        try {
            await onSubmit({ body: trimmed, mentions: picked.filter((p) => namesPerson(text, p.name)).map((p) => p.key) });
            if (!initial) {
                setText("");
                setCaret(0);
                setPicked([]);
                setAttempted(false);
            }
        } catch (error) {
            // what was written stays, with the reason and Retry under it
            setFailure(error);
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (candidates.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((chosen + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(candidates[chosen]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setListOpen(false);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
        } else if (e.key === "Escape" && onCancel) {
            e.stopPropagation();
            onCancel();
        }
    }

    return (
        <div className="dp-composer">
            {candidates.length > 0 && (
                <div className="dp-pop" id={listId} role="listbox" aria-label="Mention someone">
                    {candidates.map((p, i) => (
                        <button key={p.key} id={`${listId}-${i}`} type="button" role="option" aria-selected={i === chosen} className={cx("dp-opt", i === chosen && "on")}
                            onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                            <span>{p.name}</span>
                            <span className="dp-opt-kind" aria-hidden="true">{p.kind === "client" ? "Client" : "Team"}</span>
                        </button>
                    ))}
                </div>
            )}
            <textarea ref={area} className={cx("textarea dp-input", problem && "bad")} rows={2} value={text} placeholder={placeholder} aria-label={label}
                aria-invalid={problem ? true : undefined} aria-controls={candidates.length > 0 ? listId : undefined}
                aria-activedescendant={candidates.length > 0 ? `${listId}-${chosen}` : undefined}
                readOnly={busy} onChange={change} onSelect={(e) => setCaret(e.currentTarget.selectionStart)} onKeyDown={onKeyDown} />
            <FieldError message={problem} />
            {failure != null && (
                <div className="err" role="alert">
                    <Icon name="alert" />
                    <span>{errorMessage(failure)} <button type="button" className="link" onClick={() => void send()}>Retry</button></span>
                </div>
            )}
            <div className="dp-composer-foot">
                <span className={cx("dp-count", tooLong && "over")}>{trimmed.length} / {max}</span>
                <span className="grow" />
                {onCancel && <button type="button" className="btn btn-sm btn-quiet" onClick={onCancel}>Cancel</button>}
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void send()}>
                    <Icon name={initial ? "check" : "send"} />{busy ? "Sending…" : submitLabel}
                </button>
            </div>
        </div>
    );
}
