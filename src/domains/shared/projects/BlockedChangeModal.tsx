import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import LoadError from "@/shared/components/Feedback/LoadError";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useBlockedChange, useDismissBlockedChange, useForceBlockedChange } from "./blockedChangesApi";

const STATUS = { pending: "Waiting for a decision", forced: "Forced through", dismissed: "Dismissed" } as const;

/**
 * A change the profit floor refused, opened from its notification (?blocked={id}): what it was and the project's
 * profit today, to force it through (after an are-you-sure) or dismiss it. Whoever sees the project's money decides.
 */
export default function BlockedChangeModal({ id, onClose }: { id: number; onClose: () => void }) {
    const change = useBlockedChange(id);
    const force = useForceBlockedChange();
    const dismiss = useDismissBlockedChange();
    const [sure, setSure] = useState(false);
    const c = change.data;
    const busy = force.isPending || dismiss.isPending;
    const failure = force.error ?? dismiss.error;

    const foot = c?.status === "pending" ? (
        <>
            <div className="grow">{failure ? <span className="err"><Icon name="alert" />{errorMessage(failure)}</span> : sure ? "It will take the project to zero profit or below." : null}</div>
            {sure ? (
                <>
                    <button className="btn" disabled={busy} onClick={() => setSure(false)}>Cancel</button>
                    <button className="btn btn-danger" disabled={busy} onClick={() => force.mutate(id, {
                        onSuccess: (done) => { toast({ text: "Saved past the profit floor", sub: done.summary, icon: "alert" }); onClose(); },
                    })}>Force it through</button>
                </>
            ) : (
                <>
                    <button className="btn" disabled={busy} onClick={() => dismiss.mutate(id, {
                        onSuccess: () => { toast({ text: "Change dismissed", sub: c.summary, icon: "x" }); onClose(); },
                    })}>Dismiss</button>
                    <button className="btn btn-primary" disabled={busy} onClick={() => setSure(true)}>Force…</button>
                </>
            )}
        </>
    ) : <button className="btn" onClick={onClose}>Close</button>;

    return (
        <Modal size="sm" title="A change was stopped" sub={c?.projectTitle} onClose={onClose} foot={foot}>
            {change.isError ? <LoadError error={change.error} /> : !c ? <p className="muted">Loading…</p> : (
                <>
                    <p>It would take the project's profit to zero or below, so it wasn't saved.</p>
                    <div className="field mt">
                        <div className="label">The change</div>
                        <div>{c.summary}</div>
                        <div className="hint">By {c.requestedBy.name}, {fmtDate(c.requestedAt)}</div>
                    </div>
                    <div className="field mt">
                        <div className="label">Profit today</div>
                        <div className="mono">{money.exact(c.profitNow, "USD", { cents: true })}</div>
                    </div>
                    <div className="hint mt">{STATUS[c.status]}{c.decidedBy ? ` by ${c.decidedBy.name}` : ""}</div>
                </>
            )}
        </Modal>
    );
}
