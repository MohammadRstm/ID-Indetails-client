import { useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { useProtonForm } from "@/domains/shared/proton/formFill";
import { errorMessage } from "@/api/errors";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import Select from "@/shared/components/Forms/Select";
import NumberField from "@/shared/components/Forms/NumberField";
import { WORKERS } from "@/shared/format/limits";
import { money } from "@/shared/format/money";
import { addDays, companyToday, DAYS, fmtDate, fmtDateY, partsOf } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import LabourDefaultsModal from "./LabourDefaultsModal";
import { useLabourDefaults, useLabourWeek, useLabourWeeks, useSetLabourDefaults, useSubmitWeek, type LabourDefault, type LabourDefaults, type LabourWeek } from "./labourApi";
import { loadFailed } from "@/api/queryState";

// Two fields a row: workers, then pay per worker. The defaults bar is row -1, the days rows 0 to 5, and the
// Submit button sits after them as row 6, so Enter walks from the defaults through the week to Submit.
const LAST_C = 1;
type Nav = (r: number, c: number, dir: "next" | "prev") => void;

const isEnter = (e: KeyboardEvent) => e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing;

function focusCell(root: HTMLElement | null, r: number, c: number): boolean {
    const el = root?.querySelector<HTMLInputElement | HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`);
    if (!el || el.disabled) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
}

/** The defaults in force on a day; before the first dated set, the first one applies. */
function defaultsAt(history: LabourDefault[], day: string): LabourDefault | undefined {
    const oldestFirst = history.slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    return oldestFirst.filter((d) => d.effectiveFrom <= day).pop() ?? oldestFirst[0];
}

/**
 * Ground workers on site, counted day by day (the prototype's EX.LabourPanel), shared by the admin's project
 * page and the employee's: a week is reported as a whole, from the defaults it starts with.
 */
export default function LabourPanel({ project }: { project: Project }) {
    const weeks = useLabourWeeks(project.id);
    const defaults = useLabourDefaults(project.id);
    const [picked, setPicked] = useState<string | null>(null);
    const [history, setHistory] = useState(false);
    const navRef = useRef<HTMLDivElement>(null);
    const list = weeks.data?.weeks ?? [];
    // ?labour={a day} opens the week it falls in, ?labour=current this week (Proton fills it there)
    const [params] = useSearchParams();
    const asked = params.get("labour");
    const day = asked === "current" ? companyToday() : asked;
    const linked = day ? list.find((w) => w.weekStart <= day && day < addDays(w.weekStart, 7))?.weekStart ?? null : null;
    const chosen = picked ?? linked ?? list.find((w) => w.isReported)?.weekStart ?? list[0]?.weekStart ?? null;
    const week = useLabourWeek(project.id, chosen);
    const current = defaults.data?.current;

    const nav: Nav = (r, c, dir) => {
        let R = r, C = c;
        if (dir === "next") { if (C < LAST_C) C++; else { C = 0; R++; } }
        else if (C > 0) C--;
        else { C = LAST_C; R--; }
        focusCell(navRef.current, R, C);
    };

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Weekly labour</div>
                    <div className="panel-sub">Ground workers on site, counted day by day.</div>
                </div>
            </div>
            <div className="panel-body" ref={navRef}>
                {loadFailed(weeks) ? <LoadError error={weeks.error} retry={() => weeks.refetch()} what="the labour weeks" />
                    : loadFailed(defaults) ? <LoadError error={defaults.error} retry={() => defaults.refetch()} what="the labour defaults" />
                    : !weeks.data || !defaults.data ? <SkeletonLines lines={6} /> : (
                        <>
                            <DefaultsBar key={`${current?.effectiveFrom}:${current?.workers}:${current?.dailyPay}`} projectId={project.id} defaults={defaults.data}
                                onHistory={() => setHistory(true)} onNav={nav} />
                            <div className="field">
                                <label className="label required" htmlFor="lab-week">Week</label>
                                <Select id="lab-week" style={{ maxWidth: 320 }} value={chosen ?? ""} onChange={setPicked}
                                    options={list.map((w) => ({
                                        value: w.weekStart,
                                        label: `Week of ${fmtDateY(w.weekStart)}${w.isReported ? ` - ${money.fmt(w.total ?? 0)}` : " - no report yet"}`,
                                    }))} />
                            </div>
                            {!chosen ? <Empty art="time" title="No weeks in range yet" text="Once the project has been running for a few days, weeks appear here to report." />
                                : loadFailed(week) ? <LoadError error={week.error} retry={() => week.refetch()} what="the week" />
                                    : !week.data || week.data.weekStart !== chosen ? <SkeletonLines lines={6} />
                                        // the editor starts from the week as the API fills it in: it starts again when those
                                        // days change (new defaults, a report saved), not when the same days are fetched again
                                        : <WeekEditor key={`${chosen}:${week.data.isReported}:${week.data.days.map((d) => `${d.workers}x${d.dailyPay}`).join(",")}`}
                                            projectId={project.id} week={week.data} defaults={defaults.data} onNav={nav} />}
                        </>
                    )}
            </div>
            {history && defaults.data && <LabourDefaultsModal project={project} defaults={defaults.data} onClose={() => setHistory(false)} />}
        </div>
    );
}

/**
 * The defaults new weeks start from, edited right at the top of the panel: change either number and Save
 * appears (labour_report:manage, while the site is open).
 */
function DefaultsBar({ projectId, defaults, onHistory, onNav }: { projectId: number; defaults: LabourDefaults; onHistory: () => void; onNav: Nav }) {
    const cur = defaults.current ?? { workers: 0, dailyPay: 0 };
    const [workers, setWorkers] = useState(String(cur.workers));
    const [pay, setPay] = useState(cur.dailyPay);
    const set = useSetLabourDefaults(projectId);
    const saveRef = useRef<HTMLButtonElement>(null);
    const n = Math.max(0, Math.round(+workers || 0)), rate = Math.max(0, pay || 0);
    const changed = n !== cur.workers || rate !== cur.dailyPay;
    const editable = defaults.canEdit;
    const changes = defaults.history.length;

    function save(then?: () => void) {
        set.mutate({ workers: n, dailyPay: rate }, {
            onSuccess: () => {
                toast({ text: "Labour defaults updated", sub: `${n} workers × ${money.exact(rate)} a day · from ${fmtDate(companyToday())}`, icon: "checkCircle" });
                then?.();
            },
        });
    }
    // with a change typed, Enter on the last field stops at Save defaults instead of going on into the week
    const onEnter = (c: number) => (e: KeyboardEvent<HTMLInputElement>) => {
        if (!isEnter(e)) return;
        e.preventDefault();
        if (!e.shiftKey && c === LAST_C && changed && saveRef.current) { saveRef.current.focus(); return; }
        onNav(-1, c, e.shiftKey ? "prev" : "next");
    };

    return (
        <div className={cx("lab-defaults", changed && "changed")}>
            <div className="lab-defaults-head">
                <b>Defaults for new weeks</b>
                <span className="muted">Each unreported week starts from these{editable ? "; a change applies from today on" : ""}.</span>
                <span className="grow" />
                {changes > 0 && <button type="button" className="link" onClick={onHistory}>History{changes > 1 ? ` · ${changes}` : ""}</button>}
            </div>
            <div className="lab-defaults-row">
                <div className="field">
                    <label className={editable ? "label required" : "label"} htmlFor="ldb-workers">Ground workers per day</label>
                    {editable ? (
                        <NumberField id="ldb-workers" shape={WORKERS} value={workers} r={-1} c={0} onKeyDown={onEnter(0)} onChange={setWorkers} />
                    ) : <div className="lab-defaults-val mono">{cur.workers}</div>}
                </div>
                <span className="lab-defaults-x">×</span>
                <div className="field">
                    <label className={editable ? "label required" : "label"} htmlFor="ldb-pay">Cost per worker per day</label>
                    {editable ? <AmountField id="ldb-pay" value={pay} currencies={false} onChange={setPay} r={-1} c={1} onKeyDown={onEnter(1)} />
                        : <div className="lab-defaults-val mono">{money.exact(cur.dailyPay)}</div>}
                </div>
                <span className="lab-defaults-x">=</span>
                <div className="field">
                    <span className="label">A working day</span>
                    <div className="lab-defaults-val mono"><b>{money.exact(n * rate)}</b><span className="muted"> · {money.exact(n * rate * 6)} a 6-day week</span></div>
                </div>
                <span className="grow" />
                {editable && changed && (
                    <div className="row" style={{ gap: 6, alignSelf: "flex-end" }}>
                        {set.error && <span className="err" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(set.error)}</span>}
                        <button className="btn btn-sm" onClick={() => { setWorkers(String(cur.workers)); setPay(cur.dailyPay); }}>Reset</button>
                        <button className="btn btn-sm btn-primary" ref={saveRef} disabled={set.isPending} onClick={() => save()}
                            onKeyDown={(e) => {
                                if (!isEnter(e)) return;
                                e.preventDefault();
                                if (e.shiftKey) focusCell(saveRef.current?.closest(".panel-body") ?? null, -1, LAST_C);
                                else save(() => setTimeout(() => onNav(-1, LAST_C, "next"), 0));
                            }}>
                            <Icon name="check" />Save defaults
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

type Day = { date: string; workers: number | ""; dailyPay: number };

/** One week's days, as reported or as the defaults fill them in, and Submit. */
function WeekEditor({ projectId, week, defaults, onNav }: { projectId: number; week: LabourWeek; defaults: LabourDefaults; onNav: Nav }) {
    const submit = useSubmitWeek(projectId);
    const [days, setDays] = useState<Day[]>(() => week.days.map((d) => ({ date: d.date, workers: d.workers, dailyPay: d.dailyPay })));
    const editable = week.canEdit;
    // Proton sets the days asked for in this week (pay only when money actions are on and the person typed it); they check and submit
    const proton = useProtonForm("labour_week", projectId, (fill) => {
        const v = fill.labourWeek;
        if (!v || !editable) return [];
        const inWeek = (date: string | null | undefined) => !!date && week.weekStart <= date && date < addDays(week.weekStart, 7);
        if (v.week && !inWeek(v.week)) return [];
        const given = (v.days ?? []).filter((g) => inWeek(g.date));
        let changed = 0;
        const next = days.map((d) => {
            const g = given.find((x) => x.date === d.date);
            if (!g) return d;
            const workers = g.workers ?? d.workers;
            const dailyPay = g.dailyWage ?? d.dailyPay;
            if (workers === d.workers && dailyPay === d.dailyPay) return d;
            changed++;
            return { ...d, workers, dailyPay };
        });
        if (changed === 0) return [];
        setDays(next);
        return [changed === 1 ? "1 day" : `${changed} days`];
    });
    const cost = (d: Day) => (+d.workers || 0) * (d.dailyPay || 0);
    const total = days.reduce((t, d) => t + cost(d), 0);
    const cur = defaults.current;
    // did this unreported week start from older defaults than today's?
    const older = !week.isReported && !!cur && days.some((d) => {
        const then = defaultsAt(defaults.history, d.date);
        return !!then && (then.workers !== cur.workers || then.dailyPay !== cur.dailyPay);
    });

    function setDay(i: number, patch: Partial<Day>) {
        setDays(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    }
    const onEnter = (r: number, c: number) => (e: KeyboardEvent<HTMLInputElement | HTMLButtonElement>) => {
        if (!isEnter(e)) return;
        e.preventDefault();
        onNav(r, c, e.shiftKey ? "prev" : "next");
    };
    function save() {
        submit.mutate({
            weekStart: week.weekStart,
            body: { days: days.map((d) => ({ date: d.date, workers: Math.max(0, Math.round(+d.workers || 0)), dailyPay: Math.max(0, d.dailyPay || 0) })), note: week.note },
        }, {
            onSuccess: () => toast({ text: `${week.isReported ? "Updated" : "Submitted"} week of ${fmtDate(week.weekStart)}`, sub: money.fmt(total), icon: "checkCircle" }),
        });
    }

    return (
        <div className="mt-s" {...proton.guard}>
            <FilledNote fields={proton.filled} />
            {editable && (
                <div className="lab-keys">
                    <span><kbd>Enter</kbd> next field</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> back</span>
                    <span><kbd>Tab</kbd> works too</span><span className="grow" /><span className="muted">Monday to Saturday - no work on Sundays</span>
                </div>
            )}
            <div className="tbl-wrap">
                <table className="tbl tbl-min-sm">
                    <thead><tr><th>Day</th><th className="r">Workers</th><th className="r">Pay per worker</th><th className="r">Cost</th></tr></thead>
                    <tbody>
                        {days.map((d, i) => (
                            <tr key={d.date}>
                                <td><b>{DAYS[partsOf(d.date).weekday]}</b> <span className="muted">{fmtDate(d.date)}</span></td>
                                <td className="r">
                                    {editable ? (
                                        <NumberField className="r" style={{ width: 80, textAlign: "right" }} shape={WORKERS}
                                            aria-label={`Workers on ${fmtDate(d.date)}`} r={i} c={0} onKeyDown={onEnter(i, 0)}
                                            value={d.workers} onChange={(text) => setDay(i, { workers: text === "" ? "" : +text })} />
                                    ) : <span className="mono">{d.workers}</span>}
                                </td>
                                <td className="r">
                                    {editable ? (
                                        <div className="row" style={{ justifyContent: "flex-end" }}>
                                            <AmountField value={d.dailyPay} currencies={false} aria-label={`Pay per worker on ${fmtDate(d.date)}`} r={i} c={1} onKeyDown={onEnter(i, 1)} onChange={(dailyPay) => setDay(i, { dailyPay })} />
                                        </div>
                                    ) : <span className="mono">{money.fmt(d.dailyPay)}</span>}
                                </td>
                                <td className="r mono"><b>{money.fmt(cost(d))}</b></td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot><tr><td colSpan={3} className="r"><b>Weekly total</b></td><td className="r mono"><b>{money.fmt(total)}</b></td></tr></tfoot>
                </table>
            </div>
            {editable && !week.isReported && (
                <p className="hint mt-s">
                    Filled in with the project's defaults{older ? " as they were on these days" : ""} - change any day to match who was actually on site, then submit.
                </p>
            )}
            {editable ? (
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 10, gap: 10 }}>
                    {submit.error && <span className="err" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(submit.error)}</span>}
                    <button className="btn btn-primary" data-r={days.length} data-c={0} disabled={submit.isPending} onClick={save}
                        onKeyDown={(e) => { if (isEnter(e) && e.shiftKey) { e.preventDefault(); onNav(days.length, 0, "prev"); } }}>
                        <Icon name="checkCircle" />{week.isReported ? "Save changes" : "Submit week"}
                    </button>
                </div>
            ) : <p className="hint mt-s">{week.isReported ? "Closed to changes." : "Closed to new entries."}</p>}
        </div>
    );
}
