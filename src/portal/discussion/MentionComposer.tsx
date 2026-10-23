import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { errorMessage } from "@/api/errors";
import { FieldError } from "@/shared/components/Forms/Field";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { CLIENT_NAME, clientsOf, mentionAt, mentionCandidates, mentionedKeys } from "./textParts";
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
    /** A reply Proton suggests, shown in the empty box: Tab writes it in, Escape dismisses it. */
    suggestion?: string | null;
    onDismissSuggestion?: () => void;
};

/** One choice of the "@" list: a person, or the whole client side ("@Client"). */
type Choice = { key: string; name: string; label: string; tag: string; person?: DiscussionPerson };

const EVERYONE = "client:everyone";

/**
 * Writing a chat message or a comment: a box with "@" to mention someone who takes part, a count against the limit and
 * Send. Enter sends and Shift+Enter starts a new line. While the picker is open the arrow keys choose, Enter or Tab
 * picks and Escape closes it. "@Client" (the list's first choice, or "@client" typed out and a space, Enter or Tab)
 * names every client contact who takes part. A send that fails keeps the words and offers Retry, which sends them again
 * as the same message (the hooks keep its clientToken).
 */
export default function MentionComposer({
    label, placeholder, max, people, closed, initial, submitLabel = "Send", onSubmit, onCancel, focusOnOpen, suggestion, onDismissSuggestion,
}: Props) {
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
    const hintId = useId();

    const trimmed = text.trim();
    const empty = trimmed.length === 0;
    const tooLong = trimmed.length > max;
    const mention = mentionAt(text, caret);
    const query = mention?.query.toLowerCase() ?? "";
    // whom "@Client" names: none (a client alone on their side) offers no such choice
    const clients = clientsOf(people);
    const everyone: Choice = { key: EVERYONE, name: CLIENT_NAME, label: "Client (everyone)", tag: clients.length === 1 ? "1 contact" : `${clients.length} contacts` };
    // "@client" typed out in full
    const typedClient = mention != null && clients.length > 0 && query === CLIENT_NAME.toLowerCase();
    const choices: Choice[] = listOpen && mention ? [
        ...(clients.length > 0 && CLIENT_NAME.toLowerCase().startsWith(query) ? [everyone] : []),
        ...mentionCandidates(people, mention.query).map((p) => ({ key: p.key, name: p.name, label: p.name, tag: p.kind === "client" ? "Client" : "Team", person: p })),
    ] : [];
    const offered = choices.length > 0;
    // Proton's suggestion waits in the empty box, never over anything written
    const suggested = text.length === 0 && suggestion ? suggestion : null;
    const chosen = Math.min(active, choices.length - 1);
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

    function pick(choice: Choice) {
        if (!mention) return;
        const inserted = `@${choice.name} `;
        const person = choice.person;
        setText(text.slice(0, mention.start) + inserted + text.slice(caret));
        if (person) setPicked((list) => (list.some((p) => p.key === person.key) ? list : [...list, person]));
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
            await onSubmit({ body: trimmed, mentions: mentionedKeys(text, picked, people) });
            if (!initial) {
                setText("");
                setCaret(0);
                setPicked([]);
                setAttempted(false);
                // Send was disabled while it went, which drops the focus out of the drawer: back to the box, for the next one
                area.current?.focus();
            }
        } catch (error) {
            // what was written stays, with the reason and Retry under it
            setFailure(error);
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (suggested && !e.nativeEvent.isComposing && (e.key === "Tab" || e.key === "Escape") && !e.shiftKey) {
            e.preventDefault();
            if (e.key === "Escape") {
                e.stopPropagation();
                onDismissSuggestion?.();
                return;
            }
            setText(suggested);
            setCaret(suggested.length);
            caretTo.current = suggested.length;
            return;
        }
        // "@client" and a space (or Enter or Tab, with no list to pick from) becomes "@Client", for every client contact
        if (typedClient && !e.nativeEvent.isComposing && (e.key === " " || (!offered && (e.key === "Enter" || e.key === "Tab")))) {
            e.preventDefault();
            pick(everyone);
            return;
        }
        if (offered) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((chosen + (e.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(choices[chosen]);
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
            {offered && (
                <div className="dp-pop" id={listId} role="listbox" aria-label="Mention someone">
                    {/* chosen with the arrow keys from the box, which keeps the focus: the options aren't tab stops */}
                    {choices.map((choice, i) => (
                        <button key={choice.key} id={`${listId}-${i}`} type="button" role="option" tabIndex={-1} aria-selected={i === chosen}
                            className={cx("dp-opt", i === chosen && "on")} onMouseDown={(e) => { e.preventDefault(); pick(choice); }}>
                            <span>{choice.label}</span>
                            <span className="dp-opt-kind" aria-hidden="true">{choice.tag}</span>
                        </button>
                    ))}
                </div>
            )}
            {/* a combobox: "@" offers a list of people, and the option the arrow keys are on is the box's active descendant */}
            <textarea ref={area} className={cx("textarea dp-input", problem && "bad", suggested && "dp-suggested")} rows={2} value={text}
                placeholder={suggested ?? placeholder} aria-label={label} aria-describedby={suggested ? hintId : undefined}
                role="combobox" aria-autocomplete="list" aria-expanded={offered} aria-controls={offered ? listId : undefined}
                aria-activedescendant={offered ? `${listId}-${chosen}` : undefined} aria-invalid={problem ? true : undefined}
                readOnly={busy} onChange={change} onSelect={(e) => setCaret(e.currentTarget.selectionStart)} onKeyDown={onKeyDown} />
            {suggested && (
                <div className="hint dp-suggestion" id={hintId}>
                    <Icon name="chat" />Proton suggests a reply: <kbd>Tab</kbd> to use it, <kbd>Esc</kbd> to dismiss it.
                </div>
            )}
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
