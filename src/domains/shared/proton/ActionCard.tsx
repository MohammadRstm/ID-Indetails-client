import { useEffect, useId, useState } from "react";
import { errorMessage } from "@/api/errors";
import { cx } from "@/shared/utils/cx";
import { useDecideAction, useMyProtonActions, type ProtonActionSummary, type ProtonPendingAction } from "./protonApi";
import { useRunProtonCommands } from "./uiCommands";
import type { ActionState } from "./protonChat";
import { tellVoice } from "./protonVoice";

type ActionCardProps = {
    action: ProtonPendingAction;
    conversationId: string;
    state: ActionState;
    /** A newer proposal for the same change replaced this one: the API would refuse it, so the card says so instead. */
    replaced: boolean;
    onDecided: (state: ActionState) => void;
};

/** A two-step card's Confirm waits this long after Review, so a double click can't pass both steps. */
const ARM_MS = 600;

const AREAS: Record<string, string> = { design: "Design", execution: "Execution", website: "Website", company: "Company" };

/** What the API says became of a card brought back after a reload. */
function stateOf(summary: ProtonActionSummary): ActionState {
    switch (summary.status) {
        case "pending": return { kind: "open" };
        case "succeeded": return { kind: "done", message: "Done." };
        case "failed": return { kind: "failed", message: summary.errorMessage ?? "It couldn't be done." };
        case "cancelled": return { kind: "cancelled" };
        case "superseded": return { kind: "replaced" };
        case "expired": return { kind: "expired" };
        default: return { kind: "closed" };
    }
}

/**
 * A change Proton proposed, exactly as the API stored it. Nothing happens until the person presses Confirm; the
 * button sends only the proposal's id (and, where the card asks for it, the phrase the person typed), and the API
 * checks and runs the stored change itself. Typing "yes" in the chat never confirms anything.
 */
export default function ActionCard({ action, conversationId, state, replaced, onDecided }: ActionCardProps) {
    const decide = useDecideAction();
    const run = useRunProtonCommands();
    const phraseId = useId();
    const { preview } = action;
    const restored = useMyProtonActions(state.kind === "closed");
    const known = state.kind === "closed" ? restored.data?.find((a) => a.id === action.id) : undefined;
    const current = known ? stateOf(known) : state;

    const [expired, setExpired] = useState(() => new Date(action.expiresAt).getTime() <= Date.now());
    // the card closes by itself when the proposal runs out, as the API would refuse it from then on
    useEffect(() => {
        if (expired) return;
        const id = setTimeout(() => setExpired(true), Math.min(new Date(action.expiresAt).getTime() - Date.now(), 2 ** 31 - 1));
        return () => clearTimeout(id);
    }, [action.expiresAt, expired]);

    const [reviewing, setReviewing] = useState(false);
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!reviewing) return;
        const id = setTimeout(() => setArmed(true), ARM_MS);
        return () => clearTimeout(id);
    }, [reviewing]);
    const [typed, setTyped] = useState("");

    const open = current.kind === "open" && !replaced && !expired;
    const strong = preview.confirm !== "standard";
    const phraseMatches = preview.phrase != null && typed.trim().toLowerCase() === preview.phrase.trim().toLowerCase();
    const canConfirm = !decide.isPending && (preview.confirm === "typed" ? phraseMatches : preview.confirm !== "two_step" || armed);

    const send = (decision: "confirm" | "cancel") =>
        decide.mutate({ action, conversationId, decision, typed: decision === "confirm" && preview.confirm === "typed" ? typed : undefined }, {
            onSuccess: (outcome) => {
                // in a voice conversation, the voice says what became of it, and only once the API has said so
                if (decision !== "confirm") {
                    tellVoice(`The person cancelled the card "${preview.title}". Nothing was changed.`);
                    return onDecided({ kind: "cancelled" });
                }

                // the API sends where to go only after a change that succeeded and whose card said so
                const did = run(outcome.uiCommands);
                tellVoice(`The person confirmed the card "${preview.title}" and it is done: ${outcome.message}`);
                onDecided({ kind: "done", message: did ? `${outcome.message} ${did}` : outcome.message });
            },
            onError: (error) => {
                tellVoice(`The change on the card "${preview.title}" was not made: ${errorMessage(error)}`);
                onDecided({ kind: "failed", message: errorMessage(error) });
            },
        });

    return (
        <div className={cx("proton-action", !open && "closed", strong && "strong")} role="group" aria-label={preview.title}>
            <div className="proton-action-head">
                <span className="proton-action-kicker">
                    Change for you to confirm{preview.area && AREAS[preview.area] ? ` · ${AREAS[preview.area]}` : ""}
                </span>
                <span className={cx("pill", strong ? "pill-neg" : action.risk === "low" ? "pill-low" : "pill-mid")}>
                    {strong ? "Check carefully" : action.risk === "low" ? "Low risk" : "Medium risk"}
                </span>
            </div>
            <div className="proton-action-title">{preview.title}</div>
            <dl className="proton-action-changes">
                {preview.changes.map((change) => (
                    <div key={change.label}>
                        <dt>{change.label}</dt>
                        <dd>
                            {change.before != null && <><s className="muted">{change.before}</s>{" → "}</>}
                            {change.after}
                        </dd>
                    </div>
                ))}
            </dl>
            {preview.reach && <div className="proton-action-note">{preview.reach}</div>}
            {preview.irreversible && <div className="proton-action-note neg">This can't be undone.</div>}
            {preview.note && <div className="muted proton-action-note">{preview.note}</div>}
            {preview.opensAfter && open && <div className="muted proton-action-note">After you confirm, I'll open {preview.opensAfter}.</div>}

            {open && preview.confirm === "typed" && preview.phrase && (
                <div className="proton-action-phrase">
                    <label htmlFor={phraseId}>Type <b>{preview.phrase}</b> to confirm</label>
                    <input id={phraseId} className="input" value={typed} autoComplete="off" spellCheck={false}
                        onChange={(e) => setTyped(e.target.value)} />
                </div>
            )}

            {open ? (
                <div className="proton-action-foot">
                    <button className="btn btn-sm" disabled={decide.isPending} onClick={() => send("cancel")}>Cancel</button>
                    {preview.confirm === "two_step" && !reviewing ? (
                        <button className="btn btn-sm" onClick={() => setReviewing(true)}>Review</button>
                    ) : (
                        <button className="btn btn-sm btn-primary" disabled={!canConfirm} onClick={() => send("confirm")}>
                            {decide.isPending ? "Working…" : "Confirm"}
                        </button>
                    )}
                </div>
            ) : (
                <div className={cx("proton-action-outcome", current.kind === "failed" && "neg")} role="status">
                    {current.kind === "done" ? current.message
                        : current.kind === "failed" ? current.message
                        : current.kind === "cancelled" ? "Cancelled. Nothing was changed."
                        : current.kind === "closed" ? "This card closed when the page reloaded. Ask me again if you still want it."
                        : replaced || current.kind === "replaced" ? "Replaced by a newer proposal."
                        : "This proposal expired. Ask me again if you still want it."}
                </div>
            )}
        </div>
    );
}
