import { useState } from "react";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { toast } from "@/shared/components/Feedback/toast";
import LoadError from "@/shared/components/Feedback/LoadError";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useApproveDayOffHours, useBlockedChange, useDismissBlockedChange, useForceBlockedChange } from "./blockedChangesApi";

const STATUS = { pending: "Waiting for a decision", forced: "Forced through", dismissed: "Dismissed" } as const;

/**
 * A change the profit floor refused, opened from its notification (?blocked={id}): what it was and the project's
 * profit today, to force it through (after an are-you-sure) or dismiss it. Whoever sees the project's money decides;
 * a held pay change is the super admins' alone, and lists every project it reaches with what forcing it would leave.
 * Hours someone logged on a day of their time off are the super admins' too: approved as overtime or as normal hours,
 * or turned down.
 */
export default function BlockedChangeModal({ id, onClose }: { id: number; onClose: () => void }) {
    const change = useBlockedChange(id);
    const force = useForceBlockedChange();
    const approve = useApproveDayOffHours();
    const dismiss = useDismissBlockedChange();
    const [sure, setSure] = useState(false);
    const c = change.data;
    const pay = c?.kind === "pay_change";
    // hours logged by someone whose department isn't on the project: approved alone, or turned down
    const waiting = c?.kind === "work_entry_department";
    // hours logged on a day of the person's own time off
    const dayOff = c?.kind === "work_entry_time_off";
    const busy = force.isPending || approve.isPending || dismiss.isPending;
    const failure = force.error ?? approve.error ?? dismiss.error;
    const approveAs = (asOvertime: boolean) => approve.mutate({ id, asOvertime }, {
        onSuccess: (done) => {
            toast({ text: asOvertime ? "Hours approved as overtime" : "Hours approved as normal hours", sub: done.summary, icon: "checkCircle" });
            onClose();
        },
    });

    const foot = c?.status === "pending" && dayOff ? (
        <>
            <div className="grow">{failure ? <span className="err"><Icon name="alert" /><ErrorMessage error={failure} /></span> : null}</div>
            <button className="btn" disabled={busy} onClick={() => dismiss.mutate(id, {
                onSuccess: () => { toast({ text: "Hours turned down", sub: c.summary, icon: "x" }); onClose(); },
            })}>Decline</button>
            <button className="btn" disabled={busy} onClick={() => approveAs(false)}>Approve as normal hours</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => approveAs(true)}>Approve as overtime</button>
        </>
    ) : c?.status === "pending" && waiting ? (
        <>
            <div className="grow">{failure ? <span className="err"><Icon name="alert" /><ErrorMessage error={failure} /></span> : null}</div>
            <button className="btn" disabled={busy} onClick={() => dismiss.mutate(id, {
                onSuccess: () => { toast({ text: "Hours turned down", sub: c.summary, icon: "x" }); onClose(); },
            })}>Turn down</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => force.mutate(id, {
                onSuccess: (done) => { toast({ text: "Hours approved", sub: done.summary, icon: "checkCircle" }); onClose(); },
            })}>Approve hours</button>
        </>
    ) : c?.status === "pending" ? (
        <>
            <div className="grow">{failure ? <span className="err"><Icon name="alert" /><ErrorMessage error={failure} /></span> : sure ? (pay ? "It will take these projects to zero profit or below, and the employee is told their pay changed." : "It will take the project to zero profit or below.") : null}</div>
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
        <Modal size="sm" title={dayOff ? "Hours on a day off" : waiting ? "Hours waiting for approval" : pay ? "A pay change was held" : "A change was stopped"}
            sub={pay ? c?.person?.name : c?.projectTitle} onClose={onClose} foot={foot}>
            {change.isError ? <LoadError error={change.error} /> : !c ? <p className="muted">Loading…</p> : dayOff ? (
                <>
                    <p>{c.requestedBy.name} logged these hours on a day of their time off. Approved as overtime, every minute counts as overtime. Approved as normal hours, they count like any other hours and the day off stays as it was, paid or unpaid.</p>
                    <div className="field mt">
                        <div className="label">The hours</div>
                        <div>{c.summary}</div>
                        <div className="hint">By {c.requestedBy.name}, {fmtDate(c.requestedAt)}</div>
                    </div>
                    <div className="hint mt">{STATUS[c.status]}{c.decidedBy ? ` by ${c.decidedBy.name}` : ""}</div>
                </>
            ) : waiting ? (
                <>
                    <p>{c.requestedBy.name}'s department isn't part of {c.projectTitle}. Approving logs these hours alone, without adding the department: they count under other departments, with no share of the price.</p>
                    <div className="field mt">
                        <div className="label">The hours</div>
                        <div>{c.summary}</div>
                        <div className="hint">By {c.requestedBy.name}, {fmtDate(c.requestedAt)}</div>
                    </div>
                    <div className="hint mt">{STATUS[c.status]}{c.decidedBy ? ` by ${c.decidedBy.name}` : ""}</div>
                </>
            ) : (
                <>
                    <p>{pay ? "It would take a project's profit to zero or below, so it wasn't saved. Only super admins decide it." : "It would take the project's profit to zero or below, so it wasn't saved."}</p>
                    <div className="field mt">
                        <div className="label">The change</div>
                        <div>{c.summary}</div>
                        <div className="hint">By {c.requestedBy.name}, {fmtDate(c.requestedAt)}</div>
                    </div>
                    {pay && c.projects ? (
                        <div className="tbl-wrap mt">
                            <table className="tbl" aria-label="Projects it reaches">
                                <thead><tr><th>Project</th><th className="r">Profit today</th><th className="r">If forced</th></tr></thead>
                                <tbody>
                                    {c.projects.map((p) => (
                                        <tr key={p.projectId}>
                                            <td>{p.title}</td>
                                            <td className="r mono">{money.exact(p.profitNow, "USD", { cents: true })}</td>
                                            <td className="r mono down">{p.profitIfForced == null ? "-" : money.exact(p.profitIfForced, "USD", { cents: true })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="field mt">
                            <div className="label">Profit today</div>
                            <div className="mono">{money.exact(c.profitNow, "USD", { cents: true })}</div>
                        </div>
                    )}
                    <div className="hint mt">{STATUS[c.status]}{c.decidedBy ? ` by ${c.decidedBy.name}` : ""}</div>
                </>
            )}
        </Modal>
    );
}
