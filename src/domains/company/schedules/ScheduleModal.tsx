import { useState } from "react";
import { errorMessage } from "@/api/errors";
import type { Schemas } from "@/api/types";
import type { Domain } from "@/app/permissions/permissions";
import { AREAS } from "@/app/routing/areas";
import { toast } from "@/shared/components/Feedback/toast";
import TimeField from "@/shared/components/Forms/TimeField";
import Modal from "@/shared/components/Overlays/Modal";
import { addDays, companyToday, DAYS_LONG, fmtDate, fmtDur, fmtH, formatSettings } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { daysText, hoursText, weekOrder } from "@/domains/shared/settings/workingTime";
import { useSetSchedule, type PersonSchedule } from "./schedulesApi";
import { companyWeekOf, sameWeek, weekMinutes, weekOf, workDaysOf, type Week } from "./weekDays";

type ScheduleModalProps = {
    person: PersonSchedule;
    companyWeek: Schemas["WorkingTimePolicyResponse"];
    onClose: () => void;
};

/**
 * One person's week (the prototype's ScheduleModal): each day on or off, with its own hours. A week the
 * same as the company's puts them back on it. A change applies from today, or from tomorrow when one
 * already starts today, so past days keep the hours they had.
 */
export default function ScheduleModal({ person, companyWeek, onClose }: ScheduleModalProps) {
    const today = companyToday();
    const order = weekOrder(formatSettings().weekStart);
    const def = companyWeekOf(companyWeek);
    const brk = companyWeek.breakMinutes;
    const save = useSetSchedule(person.userId);
    const [days, setDays] = useState<Week>(() => weekOf(person.days));
    const same = sameWeek(days, def);
    const from = person.changedOn === today ? addDays(today, 1) : today;
    const first = person.name.split(" ")[0];
    const firstOn = order.find((d) => days[d]);
    const sub = [person.position, person.team?.name, person.domain ? AREAS[person.domain as Domain]?.label : null].filter(Boolean).join(" · ");

    function submit(toDefault: boolean) {
        const followsDefault = toDefault || same;
        const body = followsDefault
            ? { followsDefault: true, days: [], effectiveFrom: from }
            : { followsDefault: false, days: workDaysOf(days).map((d) => ({ weekday: d, startMinute: days[d]!.s, endMinute: days[d]!.e })), effectiveFrom: from };
        const later = from !== today ? ` · from ${fmtDate(from)}` : "";
        save.mutate(body, {
            onSuccess: () => {
                toast(followsDefault
                    ? { text: `${first} follows the company default`, sub: `${daysText(companyWeek.workDays, formatSettings().weekStart)} · ${hoursText(companyWeek)}${later}`, icon: "calendar" }
                    : { text: `${first}'s schedule saved`, sub: `${daysText(workDaysOf(days), formatSettings().weekStart)} · ${fmtH(weekMinutes(days, brk))} required a week${later}`, icon: "calendar" });
                onClose();
            },
        });
    }

    return (
        <Modal title={`${person.name}'s schedule`} sub={sub || undefined} onClose={onClose}
            foot={
                <>
                    <div className="grow">
                        {save.isError
                            ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(save.error)}</span>
                            : <><b className="mono">{fmtH(weekMinutes(days, brk))}</b> required a week{brk ? `, after a ${fmtH(brk)} break a day` : ""}{same ? " · same as the company default" : ""}</>}
                    </div>
                    {person.isOwn && <button className="btn" disabled={save.isPending} onClick={() => submit(true)}>Use company default</button>}
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={() => submit(false)}>Save</button>
                </>
            }>
            <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>{person.isOwn ? "Has their own schedule." : "Follows the company default - changing any day gives them their own."}</span>
                <span className="grow" />
                {firstOn != null && (
                    <button className="btn btn-sm btn-quiet" onClick={() => {
                        const hours = days[firstOn]!;
                        const next: Week = {};
                        for (let d = 0; d < 7; d++) next[d] = days[d] ? { ...hours } : null;
                        setDays(next);
                    }}>Same hours every working day</button>
                )}
                <button className="btn btn-sm btn-quiet" onClick={() => setDays(def)}>Reset to default</button>
            </div>
            <div className="sc-edit">
                {order.map((d) => {
                    const v = days[d];
                    const set = (next: { s: number; e: number } | null) => setDays({ ...days, [d]: next });
                    return (
                        <div key={d} className={cx("sc-edit-row", !v && "off")}>
                            <button type="button" className="switch" role="switch" aria-checked={!!v} aria-label={`Works on ${DAYS_LONG[d]}`}
                                onClick={() => set(v ? null : { s: companyWeek.startMinute, e: companyWeek.endMinute })} />
                            <b className="sc-edit-day">{DAYS_LONG[d]}</b>
                            {v ? (
                                <div className="row" style={{ gap: 6 }}>
                                    <div style={{ width: 118 }}><TimeField label={`${DAYS_LONG[d]} start`} value={v.s} onChange={(m) => set({ s: m, e: Math.max(v.e, m + 30) })} /></div>
                                    <span className="muted">–</span>
                                    <div style={{ width: 118 }}><TimeField label={`${DAYS_LONG[d]} end`} value={v.e} min={v.s} onChange={(m) => set({ s: v.s, e: m > v.s ? m : v.s + 30 })} /></div>
                                    <span className="muted mono" style={{ fontSize: "11.5px" }}>{fmtDur(v.e - v.s)}</span>
                                </div>
                            ) : <span className="muted">Day off</span>}
                        </div>
                    );
                })}
            </div>
            <div className="hint mt-s">
                {from === today ? "Applies from today - past days keep the hours they had." : `A change already starts today, so this one applies from ${fmtDate(from)}.`}
                {!person.nextChangeOn ? ""
                    : person.nextChangeOn === from ? ` It replaces the change already set for ${fmtDate(from)}.`
                        : ` The change already set for ${fmtDate(person.nextChangeOn)} still applies from then.`}
            </div>
        </Modal>
    );
}
