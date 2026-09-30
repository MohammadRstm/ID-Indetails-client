import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { Segmented } from "@/shared/components/Forms/Filters";
import { toast } from "@/shared/components/Feedback/toast";
import { DAYS, fmtDate, fmtH, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useAddExcuse, useRemoveExcuse, type HourExcuse, type SalaryDetail } from "./salariesApi";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayList = (days: string[]) => days.map((d) => fmtDate(d)).join(", ");

/** "2 days off excused · Sep 3, Sep 4", "Whole month unpaid", "3h excused". */
function excuseText(x: HourExcuse): string {
    if (x.kind === "whole_month") return x.isPaid ? "Whole month excused" : "Whole month unpaid";
    if (x.kind === "days") return `${plural(x.days.length, x.isPaid ? "day off" : "unpaid day off", x.isPaid ? "days off" : "unpaid days off")}${x.isPaid ? " excused" : ""} · ${dayList(x.days)}`;
    return x.isPaid ? `${fmtH(x.minutes ?? 0)} excused` : `${fmtH(x.minutes ?? 0)} of unpaid leave`;
}

type ExcuseHoursProps = {
    detail: SalaryDetail;
    month: string;
    /** hours:excuse - without it the excuses are only listed. */
    canExcuse: boolean;
};

/**
 * Hours, days off or a whole month excused (the prototype's UI.ExcuseHours). Excused time comes off what the
 * month asks for. An unpaid excuse also comes off a salary, a day off at the full paid day, so for
 * salaried people it can be marked unpaid; people outside the hours rule can only take unpaid leave.
 */
export default function ExcuseHours({ detail, month, canExcuse }: ExcuseHoursProps) {
    const s = detail.salary;
    const ruled = s.expectedMinutes != null;
    const monthly = s.basis === "monthly";
    const add = useAddExcuse(s.userId);
    const remove = useRemoveExcuse();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"hours" | "days">("hours");
    const [hours, setHours] = useState("");
    const [note, setNote] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [unpaid, setUnpaid] = useState(!ruled);
    const mins = Math.round((parseFloat(hours) || 0) * 60);
    const done = new Set(detail.excuses.flatMap((x) => x.days));
    const pickedMins = detail.workingDays.filter((d) => picked.includes(d.date)).reduce((t, d) => t + d.requiredMinutes, 0);
    // only a salary loses anything for unpaid time; without the hours rule there is nothing else to excuse
    const canUnpaid = monthly;
    if (!ruled && !canUnpaid && detail.excuses.length === 0) return null;

    function start() {
        setOpen(true);
        setHours(s.shortMinutes ? String(Math.round((s.shortMinutes / 60) * 100) / 100) : "");
        add.reset();
    }

    function save(kind: "minutes" | "days" | "whole_month") {
        const isPaid = !unpaid;
        const days = kind === "days" ? [...picked].sort() : [];
        add.mutate({ month, kind, minutes: kind === "minutes" ? mins : null, days, isPaid, note: note.trim() || null }, {
            onSuccess: () => {
                toast(kind === "days"
                    ? { text: `${plural(days.length, isPaid ? "day off" : "unpaid day off", isPaid ? "days off" : "unpaid days off")}${isPaid ? " excused" : ""}`, sub: `${s.name} · ${dayList(days)}`, icon: "checkCircle" }
                    : kind === "whole_month"
                        ? { text: isPaid ? "Whole month excused" : "Whole month unpaid", sub: `${s.name} · ${fmtMonthY(month)}`, icon: "checkCircle" }
                        : { text: isPaid ? `${fmtH(mins)} excused` : `${fmtH(mins)} of unpaid leave`, sub: `${s.name} · ${fmtMonthY(month)}`, icon: "checkCircle" });
                setOpen(false); setHours(""); setNote(""); setPicked([]);
            },
        });
    }

    function drop(x: HourExcuse) {
        remove.mutate(x.id, {
            onSuccess: () => toast({ text: "Excuse removed", icon: "trash" }),
            onError: (e) => toast({ text: "The excuse wasn't removed", sub: errorMessage(e), icon: "alert" }),
        });
    }

    const toggle = (day: string) => setPicked((p) => (p.includes(day) ? p.filter((d) => d !== day) : [...p, day]));
    const paidChoice = ruled && canUnpaid && (
        <Segmented aria-label="Paid or unpaid" value={unpaid ? "unpaid" : "paid"} onChange={(v) => setUnpaid(v === "unpaid")}
            options={[{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Unpaid" }]} />
    );

    return (
        <div className="hl-excuse">
            {detail.excuses.map((x) => (
                <div key={x.id} className="hl-excuse-row">
                    <Icon name="checkCircle" />
                    <div className="grow">
                        <b>{excuseText(x)}</b>
                        <div className="muted" style={{ fontSize: "11.5px" }}>{x.note} · {fmtDate(x.createdAt)}</div>
                    </div>
                    {canExcuse && <button className="btn btn-sm btn-quiet" disabled={remove.isPending} onClick={() => drop(x)}>Remove</button>}
                </div>
            ))}
            {canExcuse && (ruled || canUnpaid) && (!open ? (
                <button className="btn btn-sm" onClick={start}><Icon name="plus" />{ruled ? "Excuse hours or days…" : "Record unpaid leave…"}</button>
            ) : (
                <div className="hl-excuse-form">
                    <div className="spread" style={{ marginBottom: 8 }}>
                        <Segmented aria-label="What to excuse" value={mode} onChange={setMode}
                            options={[{ value: "hours", label: "Hours" }, { value: "days", label: "Days off" }]} />
                        {paidChoice}
                    </div>
                    {mode === "days" ? (
                        <div>
                            <div className="hl-days">
                                {detail.workingDays.map((w) => {
                                    const taken = done.has(w.date), on = picked.includes(w.date);
                                    return (
                                        <button key={w.date} type="button" disabled={taken} className={cx("hl-day", on && "on", taken && "done")}
                                            title={taken ? "Already excused" : `${fmtH(w.requiredMinutes)} scheduled`} aria-pressed={on}
                                            aria-label={fmtDate(w.date)} onClick={() => toggle(w.date)}>
                                            <span>{DAYS[new Date(`${w.date}T12:00:00Z`).getUTCDay()]}</span><b>{+w.date.slice(8)}</b>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="field mt-s">
                                <label className="label" htmlFor="ex-day-note">Reason</label>
                                <input id="ex-day-note" className="input" placeholder="e.g. Sick leave, annual leave" value={note} onChange={(e) => setNote(e.target.value)} />
                            </div>
                            <div className="row mt-s" style={{ gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                                <span className="muted grow" style={{ fontSize: 12 }}>
                                    {picked.length ? `${plural(picked.length, "day")} · ${fmtH(pickedMins)} of scheduled hours` : "Pick the days they were off"}
                                </span>
                                <button className="btn btn-sm btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
                                <button className="btn btn-sm btn-primary" disabled={!picked.length || add.isPending} onClick={() => save("days")}>
                                    {unpaid ? "Record" : "Excuse"} {picked.length ? plural(picked.length, "day") : "days"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="row" style={{ gap: 8 }}>
                                <div className="field" style={{ width: 110 }}>
                                    <label className="label" htmlFor="ex-hours">Hours</label>
                                    <input id="ex-hours" className="input mono" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))} />
                                </div>
                                <div className="field grow">
                                    <label className="label" htmlFor="ex-note">Reason</label>
                                    <input id="ex-note" className="input" placeholder="e.g. Sick leave, public holiday" value={note} onChange={(e) => setNote(e.target.value)} />
                                </div>
                            </div>
                            <div className="row mt-s" style={{ gap: 6, justifyContent: "flex-end" }}>
                                <button className="btn btn-sm btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
                                <button className="btn btn-sm" disabled={add.isPending} onClick={() => save("whole_month")}>{unpaid ? "Whole month unpaid" : "Excuse whole month"}</button>
                                <button className="btn btn-sm btn-primary" disabled={!mins || add.isPending} onClick={() => save("minutes")}>
                                    {unpaid ? "Record" : "Excuse"} {mins ? fmtH(mins) : "hours"}
                                </button>
                            </div>
                        </div>
                    )}
                    {unpaid && <div className="hint mt-s">Unpaid time comes off the salary at its hourly rate; an unpaid day off costs the full paid day, break included.</div>}
                    {add.isError && <div className="err mt-s" role="alert"><Icon name="alert" />{errorMessage(add.error)}</div>}
                </div>
            ))}
        </div>
    );
}
