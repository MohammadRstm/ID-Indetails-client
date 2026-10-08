import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { cx } from "@/shared/utils/cx";
import { useDecideAction, type ProtonPendingAction } from "./protonApi";
import { useRunProtonCommands } from "./uiCommands";
import type { ActionState } from "./protonChat";

type ActionCardProps = {
    action: ProtonPendingAction;
    conversationId: string;
    state: ActionState;
    /** A newer proposal replaced this one: the API would refuse it, so the card says so instead. */
    replaced: boolean;
    onDecided: (state: ActionState) => void;
};

/**
 * A change Proton proposed, exactly as the API stored it. Nothing happens until the person presses Confirm; the
 * button sends only the proposal's id, and the API checks and runs the stored change itself. Typing "yes" in the
 * chat never confirms anything.
 */
export default function ActionCard({ action, conversationId, state, replaced, onDecided }: ActionCardProps) {
    const decide = useDecideAction();
    const run = useRunProtonCommands();
    const [expired, setExpired] = useState(() => new Date(action.expiresAt).getTime() <= Date.now());
    // the card closes by itself when the proposal runs out, as the API would refuse it from then on
    useEffect(() => {
        if (expired) return;
        const id = setTimeout(() => setExpired(true), Math.min(new Date(action.expiresAt).getTime() - Date.now(), 2 ** 31 - 1));
        return () => clearTimeout(id);
    }, [action.expiresAt, expired]);
    const open = state.kind === "open" && !replaced && !expired;

    const send = (decision: "confirm" | "cancel") =>
        decide.mutate({ action, conversationId, decision }, {
            onSuccess: (outcome) => {
                if (decision !== "confirm") return onDecided({ kind: "cancelled" });
                // the API sends where to go only after a change that succeeded and whose card said so
                const did = run(outcome.uiCommands);
                onDecided({ kind: "done", message: did ? `${outcome.message} ${did}` : outcome.message });
            },
            onError: (error) => onDecided({ kind: "failed", message: errorMessage(error) }),
        });

    return (
        <div className={cx("proton-action", !open && "closed")} role="group" aria-label={action.preview.title}>
            <div className="proton-action-head">
                <span className="proton-action-kicker">Proton wants to make a change</span>
                <span className={cx("pill", action.risk === "low" ? "pill-low" : "pill-mid")}>{action.risk === "low" ? "Low risk" : "Medium risk"}</span>
            </div>
            <div className="proton-action-title">{action.preview.title}</div>
            <dl className="proton-action-changes">
                {action.preview.changes.map((change) => (
                    <div key={change.label}>
                        <dt>{change.label}</dt>
                        <dd>
                            {change.before != null && <><s className="muted">{change.before}</s>{" → "}</>}
                            {change.after}
                        </dd>
                    </div>
                ))}
            </dl>
            {action.preview.note && <div className="muted proton-action-note">{action.preview.note}</div>}
            {action.preview.opensAfter && open && <div className="muted proton-action-note">After you confirm, Hourline opens {action.preview.opensAfter}.</div>}

            {open ? (
                <div className="proton-action-foot">
                    <button className="btn btn-sm" disabled={decide.isPending} onClick={() => send("cancel")}>Cancel</button>
                    <button className="btn btn-sm btn-primary" disabled={decide.isPending} onClick={() => send("confirm")}>
                        {decide.isPending ? "Working…" : "Confirm"}
                    </button>
                </div>
            ) : (
                <div className={cx("proton-action-outcome", state.kind === "failed" && "neg")} role="status">
                    {state.kind === "done" ? state.message
                        : state.kind === "failed" ? state.message
                        : state.kind === "cancelled" ? "Cancelled. Nothing was changed."
                        : replaced ? "Replaced by a newer proposal."
                        : "This proposal expired. Ask Proton again."}
                </div>
            )}
        </div>
    );
}
