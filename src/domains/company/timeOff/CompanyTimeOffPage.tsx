import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import { PageHead } from "@/shared/components/Data/Panel";
import Tabs from "@/shared/components/Data/Tabs";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import { PersonLine } from "@/shared/components/Identity/People";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { companyToday, fmtDayDate, fmtDateY, fmtRange } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { TimeOffDecisionNotes, TimeOffStatusBadge } from "../../shared/timeOff/TimeOffStatusBadge";
import {
    TIME_OFF_NOTE_MAX, useApproveTimeOff, useDeclineTimeOff, useRejectTimeOff, useTimeOffList, type TimeOff, type TimeOffView,
} from "../../shared/timeOff/timeOffApi";

const PAGE_SIZE = 25;

const VIEWS: { key: TimeOffView; label: string; empty: string; emptyText: string }[] = [
    { key: "pending", label: "Pending", empty: "Nothing waiting", emptyText: "Requests nobody has decided on yet appear here." },
    { key: "current", label: "Current & upcoming", empty: "No time off now or coming up", emptyText: "Approved time off that is under way or still ahead appears here." },
    { key: "past", label: "Past", empty: "No past time off", emptyText: "Finished, declined and withdrawn requests appear here." },
];

const periodOf = (r: TimeOff) => (r.lastDay === r.firstDay ? fmtDateY(r.firstDay) : `${fmtDateY(r.firstDay)} to ${fmtDateY(r.lastDay)}`);

/** The optional note a decision can carry. */
function NoteField({ id, label, note, onNote, error, onBlur }: {
    id: string; label: string; note: string; onNote: (v: string) => void; error: string | undefined; onBlur: () => void;
}) {
    return (
        <div className="field mt">
            <label className="label" htmlFor={id}>{label}</label>
            <AutoGrowTextarea id={id} className="input" minRows={2} maxRows={6} maxLength={TIME_OFF_NOTE_MAX} value={note}
                onChange={(e) => onNote(e.target.value)} onBlur={onBlur} />
            <FieldError message={error} />
        </div>
    );
}

/** Approves a request, with pay or without. Meetings the person is already in stay: the dialog says which. */
function ApproveModal({ request, isPaid, onClose }: { request: TimeOff; isPaid: boolean; onClose: () => void }) {
    const approve = useApproveTimeOff();
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const noteError = note.trim().length > TIME_OFF_NOTE_MAX && `At most ${TIME_OFF_NOTE_MAX} characters.`;
    const meetings = request.meetings ?? [];
    const name = request.person?.name ?? "The employee";

    function submit() {
        if (approve.isPending) return;
        if (noteError) return errors.tried();
        approve.mutate({ id: request.id, isPaid, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: `Time off approved ${isPaid ? "with pay" : "without pay"}`, sub: `${name}, ${periodOf(request)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title={isPaid ? "Approve with pay" : "Approve without pay"} sub={`${name}, ${periodOf(request)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{approve.error && <FieldError message={errorMessage(approve.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={approve.isPending} onClick={submit}><Icon name="check" />{isPaid ? "Approve with pay" : "Approve without pay"}</button>
                </>
            }>
            <p className="muted" style={{ marginTop: 0 }}>
                {plural(request.workingDays, "working day")} {isPaid ? "will be paid as normal days" : "will not be paid"}. They can't log hours on these days, and their department and the super admins are told when it starts.
            </p>
            {meetings.length > 0 && (
                <div className="banner hold" role="alert" aria-label="Meetings during the time off">
                    <Icon name="calendar" />
                    <div className="grow">
                        <b>{name} is already in {plural(meetings.length, "meeting")} during this time off.</b> They stay as they are; you may want to move them.
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                            {meetings.map((m) => <li key={m.id}>{m.topic || "Meeting"} · {fmtDayDate(m.startsAt)}, {fmtRange(m.startsAt, m.endsAt)}</li>)}
                        </ul>
                    </div>
                </div>
            )}
            <NoteField id="time-off-approve-note" label="Note (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

function DeclineModal({ request, onClose }: { request: TimeOff; onClose: () => void }) {
    const decline = useDeclineTimeOff();
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const noteError = note.trim().length > TIME_OFF_NOTE_MAX && `At most ${TIME_OFF_NOTE_MAX} characters.`;
    const name = request.person?.name ?? "The employee";
    function submit() {
        if (decline.isPending) return;
        if (noteError) return errors.tried();
        decline.mutate({ id: request.id, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Time off declined", sub: `${name}, ${periodOf(request)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Decline the request?" sub={`${name}, ${periodOf(request)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{decline.error && <FieldError message={errorMessage(decline.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={decline.isPending} onClick={submit}>Decline</button>
                </>
            }>
            <NoteField id="time-off-decline-note" label="Why (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

/** Takes approved time off back. Days before today stay time off; today and after become normal work days. */
function RejectModal({ request, onClose }: { request: TimeOff; onClose: () => void }) {
    const reject = useRejectTimeOff();
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const noteError = note.trim().length > TIME_OFF_NOTE_MAX && `At most ${TIME_OFF_NOTE_MAX} characters.`;
    const name = request.person?.name ?? "The employee";
    function submit() {
        if (reject.isPending) return;
        if (noteError) return errors.tried();
        reject.mutate({ id: request.id, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Time off rejected", sub: `${name} is back at work from today`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Reject the approved time off?" sub={`${name}, ${periodOf(request)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{reject.error && <FieldError message={errorMessage(reject.error)} />}</div>
                    <button className="btn" onClick={onClose}>Keep it</button>
                    <button className="btn btn-danger" disabled={reject.isPending} onClick={submit}>Reject</button>
                </>
            }>
            <p className="muted" style={{ marginTop: 0 }}>
                Days before today stay time off, paid or unpaid as approved. Today and every day after become normal work days, and {name} can log hours again.
            </p>
            <NoteField id="time-off-reject-note" label="Why (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

type Deciding = { kind: "approve"; request: TimeOff; isPaid: boolean } | { kind: "decline" | "reject"; request: TimeOff };

/** Everyone's time off for the super admins (time_off:decide): decide the pending requests and take back approved ones. */
export default function CompanyTimeOffPage() {
    const [view, setView] = useState<TimeOffView>("pending");
    const [page, setPage] = useState(1);
    const [deciding, setDeciding] = useState<Deciding | null>(null);
    const list = useTimeOffList(view, page, PAGE_SIZE);
    const anchor = useRef<HTMLDivElement>(null);
    const today = companyToday();
    const data = list.data;
    const current = VIEWS.find((v) => v.key === view)!;

    return (
        <div className="page">
            <PageHead title="Time off" sub="Requests from Design employees. Approve with pay or without, or decline. Approved time off can be taken back until its last day." />
            <Tabs value={view} onChange={(next) => { setView(next); setPage(1); }}
                items={VIEWS.map((v) => ({ key: v.key, label: v.label, count: v.key === view ? data?.totalCount : undefined }))} />
            <div className="panel mt" ref={anchor} aria-label={current.label}>
                {loadFailed(list) ? <div className="panel-body"><LoadError error={list.error} retry={() => list.refetch()} what="the time off" /></div>
                    : !data ? <div className="panel-body"><SkeletonLines lines={5} /></div>
                        : data.items.length === 0 ? <Empty art="time" title={current.empty} text={current.emptyText} />
                            : (
                                <>
                                    <div className="tbl-wrap">
                                        <table className="tbl">
                                            <thead>
                                                <tr><th>Person</th><th>Days</th><th className="r">Working days</th><th className="r">Taken this year</th><th>Status</th><th /></tr>
                                            </thead>
                                            <tbody>
                                                {data.items.map((r) => (
                                                    <tr key={r.id}>
                                                        <td>
                                                            {r.person ? <PersonLine person={{ id: r.person.id, name: r.person.name, photoFileId: r.person.photoFileId }} sub={r.person.departmentName ?? false} /> : "-"}
                                                        </td>
                                                        <td>
                                                            <b>{periodOf(r)}</b>
                                                            <div className="muted" style={{ fontSize: 11.5 }}>{r.reason}</div>
                                                        </td>
                                                        <td className="r mono">
                                                            {r.workingDays}
                                                            {r.daysTaken > 0 && r.daysTaken !== r.workingDays && <div className="muted" style={{ fontSize: 11.5 }}>{r.daysTaken} taken</div>}
                                                        </td>
                                                        <td className="r mono">{r.takenThisYear ?? "-"}</td>
                                                        <td>
                                                            <TimeOffStatusBadge request={r} />
                                                            <TimeOffDecisionNotes request={r} />
                                                        </td>
                                                        <td className="r">
                                                            <div className="row end wrap" style={{ gap: 6 }}>
                                                                {r.status === "pending" && (
                                                                    <>
                                                                        <button className="btn btn-sm btn-primary" onClick={() => setDeciding({ kind: "approve", request: r, isPaid: true })}>Approve with pay</button>
                                                                        <button className="btn btn-sm" onClick={() => setDeciding({ kind: "approve", request: r, isPaid: false })}>Approve without pay</button>
                                                                        <button className="btn btn-sm" onClick={() => setDeciding({ kind: "decline", request: r })}>Decline</button>
                                                                    </>
                                                                )}
                                                                {r.status === "approved" && r.lastDay >= today && (
                                                                    <button className="btn btn-sm" onClick={() => setDeciding({ kind: "reject", request: r })}>Reject</button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <Pager page={page} pageSize={PAGE_SIZE} total={data.totalCount} onPage={setPage} anchor={anchor} />
                                </>
                            )}
            </div>
            {deciding?.kind === "approve" && <ApproveModal request={deciding.request} isPaid={deciding.isPaid} onClose={() => setDeciding(null)} />}
            {deciding?.kind === "decline" && <DeclineModal request={deciding.request} onClose={() => setDeciding(null)} />}
            {deciding?.kind === "reject" && <RejectModal request={deciding.request} onClose={() => setDeciding(null)} />}
        </div>
    );
}
