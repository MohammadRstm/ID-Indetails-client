import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCompanySettings } from "@/app/shell/shellQueries";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SwitchRow, Toggle } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import TimeField from "@/shared/components/Forms/TimeField";
import { companyToday, DAYS, fmtDate, fmtH } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useDomainSettings, type DomainSettings } from "../../design/work/workApi";
import { rulesBody } from "./domainRules";
import { OnlyFor } from "./SettingBits";
import { useSaveDomainRules, useSetWorkingTime, useWorkingTime, type WorkingTime } from "./settingsApi";
import { notSaved, saved } from "./settingsToasts";
import { BREAKS, breakText, clock, daysText, hoursText, nextChange, requiredOf, weekOrder } from "./workingTime";
import { loadFailed } from "@/api/queryState";

const EDIT_WINDOWS = [
    { value: "none", label: "No editing" }, { value: "one_day", label: "24 hours" }, { value: "seven_days", label: "7 days" }, { value: "unlimited", label: "Always" },
] as const;

/** The prototype's Settings → Time tracking: the company's working week and break, and the domain's rules for entries. */
export default function TimeSettings({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const rulesQuery = useDomainSettings(domain);
    const wtQuery = useWorkingTime();
    const rules = rulesQuery.data;
    const wt = wtQuery.data;
    const failed = loadFailed(rulesQuery) ? rulesQuery : loadFailed(wtQuery) ? wtQuery : null;
    const weekStart = useCompanySettings().data?.weekStart ?? 1;
    const save = useSaveDomainRules(domain);
    const canRule = permissions.has(P.DOMAIN_SETTINGS_MANAGE);
    const canTime = permissions.has(P.WORKING_TIME_MANAGE);
    const set = (patch: Partial<DomainSettings>) => rules && save.mutate({ ...rulesBody(rules), ...patch }, { onSuccess: saved(), onError: notSaved });
    const toggle = (k: keyof DomainSettings, label: string) => (
        <Toggle label={label} checked={!!rules?.[k]} disabled={!canRule || !rules || save.isPending} onChange={(on) => set({ [k]: on })} />
    );

    return (
        <div className="panel">
            <div className="panel-head">
                <div><div className="panel-title">Time tracking rules</div><div className="panel-sub">These are the decisions that shape how clean the data stays.</div></div>
            </div>
            <div className="panel-body">
                {failed ? <LoadError error={failed.error} retry={() => failed.refetch()} what="the time tracking rules" />
                    : !rules || !wt ? <SkeletonLines lines={8} /> : (
                    <>
                        <SwitchRow title="Default working hours"
                            description={<>The week everyone works unless they have their own schedule (Company → Schedules). Its hours are also the working day that overtime is measured against.{!canTime && <OnlyFor who="a super admin" />}</>}
                            control={canTime ? <WeekEditor wt={wt} /> : <b className="mono">{daysText(wt.current.workDays, weekStart)} · {hoursText(wt.current)}</b>} />
                        <SwitchRow title="Break per day"
                            description={<>One break for everyone, taken whenever suits. The break is paid, but it isn't required work: on every working day longer than 6 hours, 9 to 5 with a 1h break asks for 7h of work and is paid as 8h. Time worked past the 7h counts as overtime.{!canTime && <OnlyFor who="a super admin" />}</>}
                            control={<BreakEditor wt={wt} canEdit={canTime} />} />
                        <SwitchRow title="Entry edit window" description="How long an employee can edit or delete their own entry after logging it." control={
                            <Select className="select sm" style={{ width: 150 }} aria-label="Entry edit window" disabled={!canRule || save.isPending} value={rules.editWindow}
                                onChange={(v) => set({ editWindow: v })} options={[...EDIT_WINDOWS]} />
                        } />
                        <SwitchRow title="Allow overlapping entries" description="Off means one person cannot log two pieces of work at the same time." control={toggle("allowOverlap", "Allow overlapping entries")} />
                        <SwitchRow title="Allow future entries" description="Off means work can only be logged up to the current time." control={toggle("allowFutureEntries", "Allow future entries")} />
                        <SwitchRow title="Require a work description" description="Entries must say what the time was spent on." control={toggle("requireDescription", "Require a work description")} />
                        <SwitchRow title="Start/stop timer" description="Shows the timer in the top bar as an alternative to typing times." control={toggle("timerEnabled", "Start/stop timer")} />
                        <SwitchRow title="Daily logging reminder" description="From 3 PM on a weekday, anyone with nothing logged today sees a reminder on their home page." control={toggle("logReminder", "Daily logging reminder")} />
                    </>
                )}
            </div>
        </div>
    );
}

/** The company week: its days, and when the working day starts and ends (the prototype's DefaultScheduleEditor). */
function WeekEditor({ wt }: { wt: WorkingTime }) {
    const weekStart = useCompanySettings().data?.weekStart ?? 1;
    const setWt = useSetWorkingTime();
    const change = nextChange(wt, companyToday());
    const base = change.latest;
    const [days, setDays] = useState(base.workDays);
    const [start, setStart] = useState(base.startMinute);
    const [end, setEnd] = useState(base.endMinute);
    const changed = [...days].sort().join() !== [...base.workDays].sort().join() || start !== base.startMinute || end !== base.endMinute;
    const required = requiredOf(start, end, base.breakMinutes);

    function toggle(d: number) {
        setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort());
    }
    function save() {
        setWt.mutate(change.body({ workDays: [...days].sort(), startMinute: start, endMinute: end }), {
            onSuccess: saved("Default working hours saved", `${daysText(days, weekStart)} · ${clock(start)} – ${clock(end)} · ${change.when}`),
        });
    }
    return (
        <div className="sc-def-edit">
            <div className="chips">
                {weekOrder(weekStart).map((d) => (
                    <button key={d} type="button" className={cx("chip", days.includes(d) && "on")} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>{DAYS[d]}</button>
                ))}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <div style={{ width: 118 }}><TimeField label="Working day starts" value={start} onChange={(m) => { setStart(m); setEnd(Math.max(end, m + 30)); }} /></div>
                <span className="muted">–</span>
                <div style={{ width: 118 }}><TimeField label="Working day ends" value={end} min={start} onChange={(m) => setEnd(m > start ? m : start + 30)} /></div>
                <span className="muted" style={{ fontSize: 12 }}>{fmtH(required)} required a day{base.breakMinutes && end - start > 360 ? ` after the ${fmtH(base.breakMinutes)} break` : ""}</span>
                {changed && <button className="btn btn-sm btn-primary" disabled={!days.length || setWt.isPending} onClick={save}>Save</button>}
            </div>
            {changed && days.length > 0 && (
                <div className="banner hold mt-s" role="note">
                    <Icon name="alert" />
                    <div>
                        <b>This changes pay</b> for everyone on the company week from {fmtDate(change.from)}: the hours they owe each month, which hours count as overtime,
                        and how a salary is pro-rated. Past days are paid as they were.
                    </div>
                </div>
            )}
            {days.length === 0 && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />Pick at least one working day.</div>}
            {setWt.error != null && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(setWt.error)}</div>}
        </div>
    );
}

/** One break for everyone; only a super admin changes it (the prototype's BreakEditor). */
function BreakEditor({ wt, canEdit }: { wt: WorkingTime; canEdit: boolean }) {
    const setWt = useSetWorkingTime();
    const change = nextChange(wt, companyToday());
    const p = change.latest;
    const opts = BREAKS.includes(p.breakMinutes) ? BREAKS : [...BREAKS, p.breakMinutes].sort((a, b) => a - b);
    function save(minutes: number) {
        setWt.mutate(change.body({ breakMinutes: minutes }), {
            onSuccess: saved(minutes ? `Break set to ${fmtH(minutes)} a day` : "No break", `${hoursText(p)} now asks for ${fmtH(requiredOf(p.startMinute, p.endMinute, minutes))} of work · the break stays paid · ${change.when}`),
            onError: notSaved,
        });
    }
    return (
        <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
            {canEdit ? (
                <Select className="select sm" style={{ width: 130 }} aria-label="Break per day" value={String(p.breakMinutes)} onChange={(v) => save(+v)} disabled={setWt.isPending}
                    options={opts.map((m) => ({ value: String(m), label: breakText(m) }))} />
            ) : <b className="mono">{breakText(p.breakMinutes)}</b>}
            <span className="muted" style={{ fontSize: 12 }}>{hoursText(p)} = {fmtH(requiredOf(p.startMinute, p.endMinute, p.breakMinutes))} of work required, {fmtH(p.endMinute - p.startMinute)} paid</span>
        </div>
    );
}
