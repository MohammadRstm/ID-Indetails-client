import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import DateInput from "@/shared/components/Forms/DateInput";
import Select from "@/shared/components/Forms/Select";
import { addDays, companyToday, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { closedMonths, monthName, useEndReopen, useReopenedMonths, useReopenMonth } from "../../design/work/reopenedMonthsApi";

/**
 * Settings › Time tracking for a super admin: open a closed month for logging again until a day. People then log, change
 * and remove their own work in it with no approval, and it locks again by itself after that day. Hours logged where an
 * excuse stood in for them take the excuse's place.
 */
export default function ReopenedMonthsPanel() {
    const today = companyToday();
    const months = closedMonths(today);
    const open = useReopenedMonths();
    const reopen = useReopenMonth();
    const end = useEndReopen();
    const [month, setMonth] = useState(months[0]);
    const [until, setUntil] = useState(addDays(today, 14));
    const [note, setNote] = useState("");
    const already = open.data?.find((m) => m.month === month);
    // shown as it is typed, as every form here does
    const untilError = !until ? "Pick the last day it stays open." : until < today ? "Keep it open until today or a later day." : undefined;

    function submit() {
        if (untilError) return;
        reopen.mutate({ month, openUntil: until, note: note.trim() || null }, {
            onSuccess: () => {
                toast({ text: `${monthName(month)} is open for logging`, sub: `Until ${fmtDateY(until)}. Design staff were told.`, icon: "checkCircle" });
                setNote("");
            },
        });
    }

    function lock(m: string) {
        end.mutate(m, {
            onSuccess: () => toast({ text: `${monthName(m)} is locked again`, icon: "lock" }),
            onError: (e) => toast({ text: "It wasn't locked", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Reopened months</div>
                    <div className="panel-sub">Past months are locked. Open one again so people can log the hours they missed: their salaries and the projects' costs for that month change as they do.</div>
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(open) ? <LoadError error={open.error} retry={() => open.refetch()} what="the reopened months" />
                    : !open.data ? <SkeletonLines lines={2} />
                        : open.data.length === 0 ? <p className="muted" style={{ margin: 0 }}>No month is open for logging.</p> : (
                            <div className="reopened-list">
                                {open.data.map((m) => (
                                    <div key={m.month} className="row reopened-row">
                                        <Icon name="calendar" />
                                        <div className="grow" style={{ minWidth: 0 }}>
                                            <div><b>{monthName(m.month)}</b> · open until {fmtDateY(m.openUntil)}</div>
                                            <div className="muted trunc" style={{ fontSize: 12 }}>By {m.reopenedBy.name}{m.note ? ` · ${m.note}` : ""}</div>
                                        </div>
                                        <button className="btn btn-sm" disabled={end.isPending} onClick={() => lock(m.month)}>Lock now</button>
                                    </div>
                                ))}
                            </div>
                        )}

                <div className="reopen-form mt">
                    <div className="field">
                        <label className="label" htmlFor="reopen-month">Month</label>
                        <Select id="reopen-month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: monthName(m) }))} />
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="reopen-until">Open until</label>
                        <DateInput id="reopen-until" value={until} onChange={setUntil} min={today} aria-label="Open until" />
                        {untilError && <div className="err">{untilError}</div>}
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="reopen-note">Note</label>
                        <input id="reopen-note" className="input" maxLength={255} placeholder="Optional - e.g. Catching up on October's hours" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                </div>
                {reopen.error && <div className="err mt"><ErrorMessage error={reopen.error} /></div>}
                <div className="row mt" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-primary" disabled={!!untilError || reopen.isPending} onClick={submit}>
                        {already ? `Keep ${monthName(month)} open until then` : `Reopen ${monthName(month)}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
