import { useState } from "react";
import type { Schemas } from "@/api/types";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import { addMonths, fmtDate, fmtDayDate, fmtDur, fmtH, fmtMonthY, monthKey } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { HOURS_PER_MONTH } from "./payRules";
import { companyNow, hoursText } from "../work/day";
import { openLogWork } from "../work/logWorkStore";
import { useMyPay, useMySchedule } from "../work/workApi";
import { loadFailed } from "@/api/queryState";
import HelpHint from "@/domains/shared/help/HelpHint";

type Pay = Schemas["MyPayResponse"];
type Ledger = Schemas["MyLedgerMonthResponse"];

const signed = (m: number) => `${m < 0 ? "−" : m > 0 ? "+" : ""}${fmtH(Math.abs(m))}`;
const cash = (v: number, cur: string, cents = false) => money.exact(v, cur, cents ? { cents: true } : undefined);

/**
 * What a Design employee has earned so far this month, from the work they have logged, and whether they
 * are keeping up with the hours their schedule asks for (the prototype's P.EmpPay).
 */
export default function MyPayPage() {
    const { today } = companyNow();
    const thisMonth = monthKey(today);
    const [month, setMonth] = useState(thisMonth);
    const [allDays, setAllDays] = useState(false);
    const pay = useMyPay(month);
    const schedule = useMySchedule(today);
    const r = pay.data;
    const first = r ? [r.firstMonth.slice(0, 7), addMonths(thisMonth, -11)].sort()[1] : thisMonth;
    const go = (m: string) => { setMonth(m); setAllDays(false); };

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">My pay</h1>
                    <div className="page-sub">
                        What you've earned {!r || r.inProgress ? "so far this month" : `in ${fmtMonthY(month)}`}, from the work you've logged
                        {r?.ledger ? ", and how you're doing on the hours your schedule asks for" : ""}.
                    </div>
                </div>
                <div className="page-actions" style={{ gap: 6, alignItems: "center" }}>
                    <button className="icon-btn" aria-label="Previous month" disabled={month <= first} onClick={() => go(addMonths(month, -1))}><Icon name="chevronLeft" /></button>
                    <b style={{ minWidth: 118, textAlign: "center" }}>{fmtMonthY(month)}</b>
                    <button className="icon-btn" aria-label="Next month" disabled={month >= thisMonth} onClick={() => go(addMonths(month, 1))}><Icon name="chevronRight" /></button>
                </div>
            </div>

            {loadFailed(pay) ? <div className="panel"><div className="panel-body"><LoadError error={pay.error} retry={() => pay.refetch()} what="your pay" /></div></div>
                : !r ? <><SkeletonKpis count={3} /><div className="panel mt"><div className="panel-body"><SkeletonLines lines={5} /></div></div></>
                    : !r.salary && !r.ledger ? <div className="panel"><Empty art="search" title="Nothing for this month" text="You hadn't joined yet." /></div>
                        : <PayMonth pay={r} month={month} breakMinutes={schedule.data?.companyWeek.breakMinutes ?? 0} typical={typicalDay(schedule.data)}
                            allDays={allDays} setAllDays={setAllDays} />}
        </div>
    );
}

/** A usual working day of theirs, to say what one asks for. */
function typicalDay(s: Schemas["MyScheduleResponse"] | undefined) {
    const days = s?.schedule.days ?? [];
    // Monday first, as the prototype reads the week
    return [1, 2, 3, 4, 5, 6, 0].map((w) => days.find((d) => d.weekday === w)).find(Boolean) ?? null;
}

type MonthProps = {
    pay: Pay;
    month: string;
    breakMinutes: number;
    typical: Schemas["ScheduleDayResponse"] | null;
    allDays: boolean;
    setAllDays: (v: boolean) => void;
};

function PayMonth({ pay: r, month, breakMinutes, typical, allDays, setAllDays }: MonthProps) {
    const s = r.salary;
    const lg = r.ledger;
    const cur = s?.currency ?? "USD";
    const monthly = s?.basis === "monthly";
    const earned = s ? (r.inProgress ? s.earnedSoFar : s.total) : 0;
    const projected = s && monthly && r.inProgress ? s.fullMonthEstimate : null;
    const logged = r.days.reduce((sum, d) => sum + d.loggedMinutes, 0);
    const inside = r.days.reduce((sum, d) => sum + d.insideMinutes, 0);
    const overtime = r.days.reduce((sum, d) => sum + d.overtimeMinutes, 0);
    const shown = allDays ? r.days : r.days.slice(0, 10);
    const st = status(lg, !!s);

    return (
        <>
            <KpiStrip items={[
                ...(s ? [{
                    key: "earned", value: cash(earned, cur),
                    label: <>{r.inProgress ? "Earned so far" : "Pay for the month"}<HelpHint article="pay" label="this pay">Your base pay for the part of the month so far, plus overtime pay. A month that is over shows its final pay.</HelpHint></>,
                    sub: <span>{r.inProgress ? (monthly ? "salary to date + overtime" : "hours logged + paid breaks") : "final"}</span>,
                }] : []),
                { key: "logged", label: "Hours logged", value: fmtH(logged), sub: <span>{fmtH(inside)} normal · <span className="ot-text">{fmtH(overtime)} overtime</span></span> },
                {
                    key: "hours", value: <span className={cx("pay-status", st.cls)}>{st.text}</span>, sub: <span>{st.sub}</span>,
                    label: <>{r.inProgress ? "Hours so far" : "Hours"}<HelpHint article="hours-balance" label="your hours balance">The hours your working days asked for, against what you worked inside your hours. Overtime makes up missing hours first.</HelpHint></>,
                },
                ...(projected != null && s ? [{
                    key: "projected", value: cash(projected, cur),
                    label: <>Full month, as things stand<HelpHint article="my-pay-estimates" label="this estimate">The month's base pay plus overtime, minus what you would lose if the month ended as far behind as you are today.</HelpHint></>,
                    sub: <span>salary + overtime so far{s.wouldLose ? " − what you're behind" : ""}</span>,
                }] : []),
            ]} />

            {lg && lg.shortMinutes > 0 && !lg.wholeMonthExcused && (
                <div className={cx("banner mt", lg.status === "short" ? "hold" : "attn")} role="status">
                    <Icon name="clock" />
                    <div className="grow">
                        {lg.status === "short" ? (
                            <><b>You finished {fmtMonthY(month)} {fmtH(lg.shortMinutes)} short.</b>{" "}
                                {monthly && s ? `${cash(s.deduction, cur)} came off your salary for it, unless a super admin excuses the hours.`
                                    : "Those hours weren't worked, so they weren't paid. The month stays marked short unless a super admin excuses it."}</>
                        ) : (
                            <><b>You're {fmtH(lg.shortMinutes)} behind.</b>{" "}Up to yesterday your schedule asked for {fmtDur(lg.expectedMinutes - lg.excusedMinutes)}
                                {lg.excusedMinutes ? ` (after ${fmtH(lg.excusedMinutes)} excused)` : ""}; you've covered {fmtDur(lg.expectedMinutes - lg.excusedMinutes - lg.shortMinutes)}.
                                {" "}{monthly && s ? `If it's still short when the month closes, about ${cash(s.wouldLose, cur)} comes off your salary.` : "Hours you don't log aren't paid."}
                                {" "}Log any time you missed, or work overtime - it makes up missing hours first.</>
                        )}
                    </div>
                    {lg.status !== "short" && <button className="btn btn-sm" onClick={() => openLogWork()}><Icon name="plus" />Log work</button>}
                </div>
            )}

            <div className="grid g-2 mt pay-grid">
                {s && <HowItAddsUp pay={r} salary={s} ledger={lg} breakMinutes={breakMinutes} typical={typical} />}
                {lg && (
                    <div className="panel">
                        <div className="panel-head"><div><div className="panel-title">Your hours {r.inProgress ? "so far" : ""}</div>
                            <div className="panel-sub">{typicalText(typical)}</div></div></div>
                        <div className="panel-body">
                            <div className="pay-lines">
                                <div><span>Required{r.inProgress ? " up to yesterday" : ""}</span><span className="mono">{fmtH(lg.expectedMinutes)}</span></div>
                                {lg.excusedMinutes > 0 && <div><span>Excused</span><span className="mono">{lg.wholeMonthExcused ? "whole month" : `−${fmtH(lg.excusedMinutes)}`}</span></div>}
                                <div><span>Worked inside your hours</span><span className="mono">{fmtH(lg.insideMinutes)}</span></div>
                                {lg.madeUpMinutes > 0 && <div><span>Made up from overtime</span><span className="mono">{fmtH(lg.madeUpMinutes)}</span></div>}
                                <div className={cx("pay-total", lg.shortMinutes > 0 && !lg.wholeMonthExcused && "down")}>
                                    <span>{lg.shortMinutes > 0 && !lg.wholeMonthExcused ? (lg.inProgress ? "Behind" : "Short") : "Covered"}</span>
                                    <span className="mono">{lg.shortMinutes > 0 && !lg.wholeMonthExcused ? fmtH(lg.shortMinutes) : "✓"}</span>
                                </div>
                            </div>
                            {r.inProgress && <div className="hint mt-s">{fmtH(lg.expectedFullMonthMinutes)} are due over the whole month. Today isn't counted until it ends.</div>}
                        </div>
                    </div>
                )}
            </div>

            {r.days.length > 0 && (
                <div className="panel mt">
                    <div className="panel-head"><div><div className="panel-title">Day by day</div>
                        <div className="panel-sub">What each day asked for and what you logged. Overtime is time outside your hours, or past what the day asks for.</div></div></div>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>Day</th><th className="r">Required</th><th className="r">Logged</th><th className="r">Inside hours</th><th className="r">Overtime</th><th className="r">Difference</th></tr></thead>
                            <tbody>
                                {shown.map((d) => (
                                    <tr key={d.date}>
                                        <td className="nowrap"><b>{fmtDayDate(d.date)}</b>
                                            {d.isToday && <> <span className="badge">Today</span></>}
                                            {!d.requiredMinutes && d.loggedMinutes > 0 && <> <span className="badge badge-hold">Day off</span></>}
                                            {d.excused && <> <span className="badge">Excused</span></>}</td>
                                        <td className="r mono">{d.requiredMinutes ? fmtH(d.requiredMinutes) : "-"}</td>
                                        <td className="r mono">{d.loggedMinutes ? fmtH(d.loggedMinutes) : "-"}</td>
                                        <td className="r mono">{d.insideMinutes ? fmtH(d.insideMinutes) : "-"}</td>
                                        <td className="r mono ot-text">{d.overtimeMinutes ? fmtH(d.overtimeMinutes) : "-"}</td>
                                        <td className={cx("r mono", (d.differenceMinutes ?? 0) < 0 && "pay-neg")}>
                                            {d.isToday ? <span className="muted">in progress</span> : d.excused || !d.requiredMinutes || d.differenceMinutes == null ? "-" : d.differenceMinutes ? signed(d.differenceMinutes) : "✓"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {r.days.length > 10 && (
                        <div className="panel-body" style={{ paddingTop: 8 }}>
                            <button className="btn btn-sm btn-quiet" onClick={() => setAllDays(!allDays)}>{allDays ? "Show fewer days" : `Show all ${r.days.length} days`}</button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/** The month's standing, as the KPI says it. */
function status(lg: Ledger | null, tracked: boolean): { cls: string; text: string; sub: string } {
    if (!lg) return { cls: "", text: tracked ? "Not tracked" : "-", sub: "" };
    if (lg.wholeMonthExcused) return { cls: "", text: "Excused", sub: "the whole month" };
    if (lg.status === "short") return { cls: "down", text: `${fmtH(lg.shortMinutes)} short`, sub: "the month closed short" };
    if (lg.status === "behind") return { cls: "down", text: `${fmtH(lg.shortMinutes)} behind`, sub: "on the days so far" };
    return { cls: "up", text: lg.inProgress ? "On track" : "Complete", sub: lg.madeUpMinutes ? `${fmtH(lg.madeUpMinutes)} made up from overtime` : "every required hour covered" };
}

/** "A working day of 9 AM – 5 PM asks for 7h of work - plus a paid 1h break, so it's paid as 8h." */
function typicalText(d: Schemas["ScheduleDayResponse"] | null): string {
    if (!d) return "Your schedule has no working days.";
    const length = d.endMinute - d.startMinute, brk = length - d.requiredMinutes;
    return `A working day of ${hoursText({ s: d.startMinute, e: d.endMinute })} asks for ${fmtH(d.requiredMinutes)} of work`
        + (brk > 0 ? ` - plus a paid ${fmtH(brk)} break, so it's paid as ${fmtH(length)}` : "") + ".";
}

type AddsUpProps = { pay: Pay; salary: NonNullable<Pay["salary"]>; ledger: Ledger | null; breakMinutes: number; typical: Schemas["ScheduleDayResponse"] | null };

/** How the month's pay is made up: salary or hours, paid breaks, any deduction, overtime. */
function HowItAddsUp({ pay: r, salary: s, ledger: lg, breakMinutes, typical }: AddsUpProps) {
    const cur = s.currency;
    const monthly = s.basis === "monthly";
    const earned = r.inProgress ? s.earnedSoFar : s.total;
    const day = !typical || (typical.startMinute === 540 && typical.endMinute === 1020) ? "9 to 5" : hoursText({ s: typical.startMinute, e: typical.endMinute });
    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">How it adds up</div>
                <div className="panel-sub">{monthly ? `Salaried · ${cash(s.amount, cur)} a month` : `Hourly · ${cash(s.hourlyRate, cur, true)} an hour`}</div></div></div>
            <div className="panel-body">
                <div className="pay-lines">
                    {monthly ? (r.inProgress ? (
                        <div><span>Salary to date · {lg ? `${fmtH(lg.expectedMinutes)} of ${fmtH(lg.expectedFullMonthMinutes)} required so far` : "this month"}</span>
                            <span className="mono">{cash(s.earnedSoFar - s.overtimePay, cur)}</span></div>
                    ) : (
                        <div><span>Monthly salary{s.proRated ? ` (from ${fmtDate(r.joinedOn)}, ${s.workingDaysPaid} of ${s.workingDays} working days)` : ""}</span>
                            <span className="mono">{cash(s.basePay + s.deduction, cur)}</span></div>
                    )) : (
                        <>
                            <div><span>Hours worked · {fmtH(s.normalMinutes)}{s.madeUpMinutes ? ` + ${fmtH(s.madeUpMinutes)} made up from overtime` : ""} at {cash(s.hourlyRate, cur, true)}/h</span>
                                <span className="mono">{cash(s.basePay - s.paidBreakPay, cur)}</span></div>
                            {s.paidBreakPay > 0 && (
                                <div><span>Paid breaks · {s.paidBreakDays} working day{s.paidBreakDays === 1 ? "" : "s"} × {fmtH(breakMinutes)}</span>
                                    <span className="mono">{cash(s.paidBreakPay, cur)}</span></div>
                            )}
                        </>
                    )}
                    {s.deduction > 0 && lg && (
                        // the deduction covers more than the shortfall: a missed day's paid break, and unpaid time off
                        <div className="down">
                            <span>{lg.shortMinutes > 0 ? `Short ${fmtH(lg.shortMinutes)}` : "Unpaid time off"}{s.deductionMinutes !== lg.shortMinutes ? ` · ${fmtH(s.deductionMinutes)} unpaid` : ""} · at {cash(s.hourlyRate, cur, true)}/h</span>
                            <span className="mono">−{cash(s.deduction, cur)}</span>
                        </div>
                    )}
                    <div><span>Overtime · {fmtH(s.overtimeMinutes)} at {cash(s.standardHourlyRate * s.overtimeMultiplier, cur, true)}/h{s.overtimeMultiplier !== 1 ? ` (×${s.overtimeMultiplier})` : ""}</span>
                        <span className="mono">{cash(s.overtimePay, cur)}</span></div>
                    <div className="pay-total"><span>{r.inProgress ? "Earned so far" : `Pay for ${fmtMonthY(r.month)}`}</span><span className="mono">{cash(earned, cur)}</span></div>
                </div>
                <div className="hint mt-s">
                    {r.inProgress ? "An estimate that grows as you log work - the final figure is worked out when the month closes. " : ""}
                    {breakMinutes ? (monthly ? `Your break is paid - your salary covers the full ${day}. ` : `Your break is paid - each day you work gets its ${fmtH(breakMinutes)} break on top of the hours you log. `) : ""}
                    Overtime first makes up any hours you're short, at your normal rate; only the rest is paid as overtime.
                    {monthly ? ` Your salary is the same every month; overtime is paid from your true hourly rate (the salary ÷ ${HOURS_PER_MONTH.toFixed(1)} h, a standard month), whatever the month.` : ""}
                </div>
            </div>
        </div>
    );
}
