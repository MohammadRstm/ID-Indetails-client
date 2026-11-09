import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { addDays, companyToday, daysBetween, fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { TimeOffDecisionNotes, TimeOffStatusBadge } from "../../shared/timeOff/TimeOffStatusBadge";
import { TIME_OFF_NOTE_MAX, useAskTimeOff, useMyTimeOff, useWithdrawTimeOff, type TimeOff } from "../../shared/timeOff/timeOffApi";

/** Asks for whole days off: from tomorrow at the earliest. A super admin decides, with pay or without. */
function RequestModal({ onClose }: { onClose: () => void }) {
    const ask = useAskTimeOff();
    const tomorrow = addDays(companyToday(), 1);
    const [firstDay, setFirstDay] = useState("");
    const [lastDay, setLastDay] = useState("");
    const [reason, setReason] = useState("");
    const errors = useFormErrors();
    const refused = ask.error ? toApiError(ask.error) : null;

    const firstError = !firstDay ? "Pick the first day." : firstDay < tomorrow ? "Time off starts tomorrow at the earliest." : false;
    const lastError = !lastDay ? "Pick the last day." : firstDay && lastDay < firstDay ? "The last day can't be before the first day." : false;
    const reasonError = !reason.trim() ? "Say why you need the time off." : reason.trim().length > TIME_OFF_NOTE_MAX && `At most ${TIME_OFF_NOTE_MAX} characters.`;
    const asked = firstDay && lastDay && lastDay >= firstDay ? daysBetween(firstDay, lastDay) + 1 : 0;

    function pickFirst(day: string) {
        setFirstDay(day);
        // the last day follows until it is set, or when it would fall before the first
        if (day && (!lastDay || lastDay < day)) setLastDay(day);
    }

    function submit() {
        if (ask.isPending) return;
        if (firstError || lastError || reasonError) return errors.tried();
        ask.mutate({ firstDay, lastDay, reason: reason.trim() }, {
            onSuccess: () => {
                toast({ text: "Time off requested", sub: "A super admin will decide, and you'll be told.", icon: "checkCircle" });
                onClose();
            },
        });
    }

    const fields = refused?.fieldErrors ?? {};
    const shownAtFoot = refused && !fields.firstDay && !fields.lastDay && !fields.reason;
    return (
        <Modal size="sm" title="Request time off" sub="Whole days, starting tomorrow at the earliest." onClose={onClose}
            foot={
                <>
                    <div className="grow">{shownAtFoot && <FieldError message={errorMessage(ask.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={ask.isPending} onClick={submit}><Icon name="send" />Send the request</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="time-off-first">First day</label>
                <DateInput id="time-off-first" className="input" value={firstDay} min={tomorrow} onChange={pickFirst} placeholder="First day" />
                <FieldError message={errors.show("firstDay", firstError) ?? fields.firstDay} />
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="time-off-last">Last day</label>
                <DateInput id="time-off-last" className="input" value={lastDay} min={firstDay || tomorrow} onChange={setLastDay} placeholder="Last day" />
                {asked > 0 && <div className="hint">{plural(asked, "day")} from {fmtDateY(firstDay)} to {fmtDateY(lastDay)}. Pay and days taken count only your working days.</div>}
                <FieldError message={errors.show("lastDay", lastError) ?? fields.lastDay} />
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="time-off-reason">Reason</label>
                <AutoGrowTextarea id="time-off-reason" className="input" minRows={2} maxRows={6} maxLength={TIME_OFF_NOTE_MAX} value={reason}
                    placeholder="e.g. Family trip." onChange={(e) => setReason(e.target.value)} onBlur={errors.touch("reason")} />
                <FieldError message={errors.show("reason", reasonError) ?? fields.reason} />
            </div>
        </Modal>
    );
}

/** Takes back a request nobody has decided yet. */
function WithdrawModal({ request, onClose }: { request: TimeOff; onClose: () => void }) {
    const withdraw = useWithdrawTimeOff();
    function submit() {
        if (withdraw.isPending) return;
        withdraw.mutate(request.id, {
            onSuccess: () => {
                toast({ text: "Request withdrawn", sub: `${fmtDateY(request.firstDay)} to ${fmtDateY(request.lastDay)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Withdraw the request?" sub={`${fmtDateY(request.firstDay)} to ${fmtDateY(request.lastDay)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{withdraw.error && <FieldError message={errorMessage(withdraw.error)} />}</div>
                    <button className="btn" onClick={onClose}>Keep it</button>
                    <button className="btn btn-danger" disabled={withdraw.isPending} onClick={submit}>Withdraw</button>
                </>
            }>
            <p className="muted" style={{ margin: 0 }}>Nobody has decided on it yet. You can ask again any time.</p>
        </Modal>
    );
}

/** The Design employee's time off (time_off:request): ask for days off, and follow what happened to each request. */
export default function TimeOffPage() {
    const mine = useMyTimeOff();
    const [asking, setAsking] = useState(false);
    const [withdrawing, setWithdrawing] = useState<TimeOff | null>(null);
    const requests = mine.data;

    return (
        <div className="page">
            <PageHead title="Time off" sub="Ask for whole days off. A super admin approves it, with pay or without, or declines it."
                actions={<button className="btn btn-primary" onClick={() => setAsking(true)}><Icon name="plus" />Request time off</button>} />
            <div className="panel mt" aria-label="Your requests">
                <div className="panel-head">
                    <div>
                        <div className="panel-title">Your requests</div>
                        <div className="panel-sub">Newest first. Only you and the super admins see why, and whether a request is paid.</div>
                    </div>
                </div>
                {loadFailed(mine) ? <div className="panel-body"><LoadError error={mine.error} retry={() => mine.refetch()} what="your time off" /></div>
                    : !requests ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                        : requests.length === 0 ? <Empty art="time" title="No time off requested" text="When you ask for days off, they are listed here with what was decided." />
                            : (
                                <div className="tbl-wrap">
                                    <table className="tbl">
                                        <thead><tr><th>Days</th><th className="r">Working days</th><th>Status</th><th /></tr></thead>
                                        <tbody>
                                            {requests.map((r) => (
                                                <tr key={r.id}>
                                                    <td>
                                                        <b>{fmtDateY(r.firstDay)}{r.lastDay !== r.firstDay && ` to ${fmtDateY(r.lastDay)}`}</b>
                                                        <div className="muted" style={{ fontSize: 11.5 }}>{r.reason}</div>
                                                    </td>
                                                    <td className="r mono">
                                                        {r.workingDays}
                                                        {r.daysTaken > 0 && r.daysTaken !== r.workingDays && <div className="muted" style={{ fontSize: 11.5 }}>{r.daysTaken} taken</div>}
                                                    </td>
                                                    <td>
                                                        <TimeOffStatusBadge request={r} />
                                                        <TimeOffDecisionNotes request={r} />
                                                    </td>
                                                    <td className="r">
                                                        {r.status === "pending" && (
                                                            <button className="btn btn-sm" onClick={() => setWithdrawing(r)}
                                                                aria-label={`Withdraw ${fmtDateY(r.firstDay)}`}>Withdraw</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
            </div>
            {asking && <RequestModal onClose={() => setAsking(false)} />}
            {withdrawing && <WithdrawModal request={withdrawing} onClose={() => setWithdrawing(null)} />}
        </div>
    );
}
