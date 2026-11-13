import { useState } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { canOpen } from "@/app/routing/routeTable";
import { useCurrentUser } from "@/app/session/useSession";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { Drawer } from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDate, fmtDayDate, fmtDur, fmtH, fmtMonthY, fmtRange } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { clickable } from "@/shared/utils/clickable";
import { cx } from "@/shared/utils/cx";
import { hasFixedSalary } from "@/domains/design/pay/payRules";
import { useMyOvertime } from "@/domains/design/work/workApi";
import { policyOn, useWorkingTime } from "@/domains/shared/settings/settingsApi";
import { AdvanceStatusBadge } from "./AdvanceStatusBadge";
import { amountOf, monthKey } from "./advanceMonths";
import ExcuseHours from "./ExcuseHours";
import { GiveAdvanceModal } from "./SalaryAdvanceWindows";
import { useSalary, type SalaryDetail, type SalaryRow } from "./salariesApi";
import { loadFailed } from "@/api/queryState";

/** A person's drawer opened by link (?person={id}): their row comes with their month, wherever they are in the list. */
export function LinkedSalaryDrawer({ userId, month, multiplier, onClose }: Omit<SalaryDrawerProps, "row"> & { userId: number }) {
    const row = useSalary(userId, month).data?.salary;
    return row ? <SalaryDrawer row={row} month={month} multiplier={multiplier} onClose={onClose} /> : null;
}

const cash = (v: number, cur: string, cents = false) => money.exact(v, cur, cents ? { cents: true } : undefined);

type SalaryDrawerProps = {
    row: SalaryRow;
    month: string;
    /** The overtime rate in force, as the list gives it. */
    multiplier: number;
    onClose: () => void;
};

/** How one person's month adds up (the prototype's SalaryDetail): hours owed, excuses, pay and overtime. */
export default function SalaryDrawer({ row, month, multiplier, onClose }: SalaryDrawerProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const detail = useSalary(row.userId, month);
    const d = detail.data;
    const domain = row.domain as Domain | null;
    const profile = domain && canOpen(permissions, domain, `people/${row.userId}`) ? `/${domain}/people/${row.userId}` : null;
    const me = useCurrentUser();
    const [giving, setGiving] = useState(false);
    // the API refuses an advance on one's own salary, so the button is left out of one's own row
    const canGive = permissions.has(P.SALARY_ADVANCE_MANAGE) && me.id !== row.userId;
    const advancesLink = (id?: number) => { onClose(); navigate(id == null ? "/company/salaries?view=advances" : `/company/salaries?view=advances&advance=${id}`); };

    return (
        <>
        <Drawer title={row.name} onClose={onClose}
            head={
                <div className="row" style={{ gap: 11 }}>
                    <Avatar person={{ name: row.name, photoFileId: row.photoFileId }} size={40} />
                    <div>
                        <div className="modal-title">{row.name}</div>
                        <div className="modal-sub">{[row.position, domain ? AREAS[domain].label : null, fmtMonthY(month)].filter(Boolean).join(" · ")}</div>
                    </div>
                </div>
            }
            foot={
                <>
                    <div className="grow muted">{(d?.inProgress ?? month === companyToday().slice(0, 7)) ? "Month in progress - figures grow as work is logged." : "Closed month."}</div>
                    {profile && <button className="btn btn-sm" onClick={() => { onClose(); navigate(profile); }}>Open profile</button>}
                </>
            }>
            {loadFailed(detail) ? <LoadError error={detail.error} retry={() => detail.refetch()} what={`${row.name.split(" ")[0]}'s pay`} />
                : !d ? <SkeletonLines lines={8} />
                    : <DetailBody detail={d} month={month} multiplier={multiplier} canExcuse={permissions.has(P.HOURS_EXCUSE)} seesWork={permissions.has(P.WORK_ENTRY_VIEW_ALL)}
                        canGive={canGive} onGive={() => setGiving(true)} onAdvances={advancesLink}
                        openProject={(id) => canOpen(permissions, "design", `projects/${id}`) ? () => { onClose(); navigate(`/design/projects/${id}`); } : null} />}
        </Drawer>
        {giving && <GiveAdvanceModal person={{ id: row.userId, name: row.name }} currency={row.currency} onClose={() => setGiving(false)} />}
        </>
    );
}

type BodyProps = {
    detail: SalaryDetail;
    month: string;
    multiplier: number;
    canExcuse: boolean;
    seesWork: boolean;
    /** Whether this person may be given an advance from here, and what to do about advances. */
    canGive: boolean;
    onGive: () => void;
    /** Opens the Advances view, on one advance when it is given. */
    onAdvances: (id?: number) => void;
    /** How to open a project from the list, when this person may. */
    openProject: (projectId: number) => (() => void) | null;
};

function DetailBody({ detail: d, month, multiplier, canExcuse, seesWork, canGive, onGive, onAdvances, openProject }: BodyProps) {
    const s = d.salary;
    const cur = s.currency;
    const ruled = s.expectedMinutes != null;
    const monthly = s.basis === "monthly";
    const otLogged = s.overtimeMinutes + s.madeUpMinutes;
    const short = s.shortMinutes ?? 0;
    const wholeMonth = d.excuses.find((x) => x.kind === "whole_month");
    const unpaid = d.excuses.filter((x) => !x.isPaid);

    return (
        <>
            <div className="kpis" style={{ borderRadius: "var(--r2)" }}>
                <Kpi label="To pay" value={cash(s.total, cur)} />
                {s.tracksHours
                    ? <Kpi label="Hours" value={fmtH(s.normalMinutes + otLogged)} sub={<span>{fmtH(s.normalMinutes)} normal · <span className="ot-text">{fmtH(otLogged)} overtime</span></span>} />
                    : <Kpi label="Hours" value="-" sub={<span>{hasFixedSalary(s.role) ? "a fixed salary: no hours are logged" : "not tracked in Execution"}</span>} />}
            </div>

            {ruled && (
                <div className="mt">
                    <div className="u" style={{ marginBottom: 6 }}>Hours owed {d.inProgress ? "so far" : "this month"}</div>
                    <div className="pay-lines">
                        <div><span>Expected by their schedule{d.inProgress ? " (days ended so far)" : ""}</span><span className="mono">{fmtH(s.expectedMinutes ?? 0)}</span></div>
                        <div><span>Worked inside their hours</span><span className="mono">{fmtH(s.normalMinutes)}</span></div>
                        {s.excusedMinutes > 0 && <div><span>Excused</span><span className="mono">{wholeMonth ? "whole month" : fmtH(s.excusedMinutes)}</span></div>}
                        <div><span>Overtime logged</span><span className="mono">{fmtH(otLogged)}</span></div>
                        {s.madeUpMinutes > 0 && <div><span>…of which made up missing hours (paid as normal)</span><span className="mono">{fmtH(s.madeUpMinutes)}</span></div>}
                        {s.overtimeThresholdMinutes != null && (
                            <div title="Everything logged, overtime or not, plus paid leave. Overtime is paid only past the threshold.">
                                <span>Counted toward the {fmtH(s.overtimeThresholdMinutes)} for overtime pay</span><span className="mono">{fmtH(s.countedMinutes ?? 0)}</span>
                            </div>
                        )}
                        {d.missedDays.length > 0 && (
                            <div title={d.missedDays.map((m) => fmtDate(m)).join(", ")}><span>Working days with nothing logged, not excused</span><span className="mono">{d.missedDays.length}</span></div>
                        )}
                        <div className={cx("pay-total", short > 0 && "down")}>
                            <span>{short ? (d.inProgress ? "Behind so far" : "Still short - flagged") : "Hours covered"}</span>
                            <span className="mono">{short ? fmtH(short) : "✓"}</span>
                        </div>
                    </div>
                    <div className="mt-s"><ExcuseHours detail={d} month={month} canExcuse={canExcuse} /></div>
                </div>
            )}
            {!ruled && monthly && (canExcuse || d.excuses.length > 0) && (
                <div className="mt">
                    <div className="u" style={{ marginBottom: 6 }}>Unpaid leave</div>
                    <ExcuseHours detail={d} month={month} canExcuse={canExcuse} />
                </div>
            )}

            <div className="mt">
                <div className="u" style={{ marginBottom: 6 }}>How the pay adds up</div>
                <div className="pay-lines">
                    {monthly ? (
                        <div>
                            <span>{s.proRated
                                ? `Monthly salary ${cash(s.amount, cur)}, pro-rated · employed ${s.workingDaysPaid} of ${s.workingDays} working days${s.leftOn ? `, left ${fmtDate(s.leftOn)}` : ""}`
                                : "Monthly salary"}</span>
                            <span className="mono">{cash(s.basePay + s.deduction, cur)}</span>
                        </div>
                    ) : (
                        <HourlyLines detail={d} month={month} />
                    )}
                    {s.deduction > 0 && (
                        <div className="down">
                            <span>{wholeMonth && !wholeMonth.isPaid ? "Whole month unpaid"
                                : `${[s.flagged && short ? `Short ${fmtH(short)}` : null, unpaid.length ? "unpaid leave" : null].filter(Boolean).join(" + ")} · ${fmtH(d.deductionMinutes)} deducted at ${cash(s.hourlyRate, cur, true)}/h`}</span>
                            <span className="mono">−{cash(s.deduction, cur)}</span>
                        </div>
                    )}
                    {s.tracksHours && (
                        <div>
                            <span>
                                Overtime · {fmtH(s.overtimePaidMinutes)}
                                {s.overtimeThresholdMinutes != null ? ` past ${fmtH(s.overtimeThresholdMinutes)} (of ${fmtH(otLogged)} logged)` : s.madeUpMinutes ? ` (of ${fmtH(otLogged)} logged)` : ""}
                                {" "}at {cash(s.overtimeRate * multiplier, cur, true)}/h{multiplier !== 1 ? ` (×${multiplier})` : ""}
                            </span>
                            <span className="mono">{cash(s.overtimePay, cur)}</span>
                        </div>
                    )}
                    <div className="pay-total"><span>To pay</span><span className="mono">{cash(s.total, cur)}</span></div>
                </div>
                {monthly && (
                    <div className="hint mt-s">
                        Salaried: {s.proRated ? "the salary is pro-rated by the working days they were employed" : "the salary is paid in full"}.
                        {" "}An hour this month is {cash(s.amount, cur)} ÷ the month's paid hours = {cash(s.hourlyRate, cur, true)}/h (it prices any deduction)
                        {s.tracksHours ? `; overtime is paid at the overtime rate set with the pay, ${cash(s.overtimeRate, cur, true)}/h (the salary ÷ 184 unless set otherwise), whatever the month` : ""}
                        {s.overtimeThresholdMinutes != null ? `, and only for the hours counted past ${fmtH(s.overtimeThresholdMinutes)} (everything logged plus paid leave; the latest overtime is the part paid)` : ""}.
                        {s.deduction > 0 && d.missedDays.length > 0 && !d.inProgress ? " A whole day missed costs the full paid day, its break included." : ""}
                    </div>
                )}
            </div>

            {(canGive || (d.advances ?? []).length > 0) && <AdvanceSection detail={d} month={month} canGive={canGive} onGive={onGive} onAdvances={onAdvances} />}
            {s.tracksHours && d.projects.length > 0 && <HoursByProject detail={d} multiplier={multiplier} openProject={openProject} />}
            {s.tracksHours && seesWork && <OvertimeDays userId={s.userId} month={month} />}
        </>
    );
}

/** Where the month's hours and overtime went, project by project, and what those hours were paid. */
function HoursByProject({ detail: d, multiplier, openProject }: { detail: SalaryDetail; multiplier: number; openProject: BodyProps["openProject"] }) {
    const s = d.salary;
    return (
        <div className="mt">
            <div className="spread">
                <div className="u">Where the hours went</div>
                <div className="muted" style={{ fontSize: "11.5px" }}>{d.projects.length} project{d.projects.length === 1 ? "" : "s"}</div>
            </div>
            <div className="tbl-wrap mt-s">
                <table className="tbl tbl-min">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th className="r" title="Logged inside their scheduled hours, with overtime that made up missing hours">In hours</th>
                            <th className="r" title="Overtime left after making up - paid at the overtime rate">Overtime</th>
                            <th className="r">Paid</th>
                        </tr>
                    </thead>
                    <tbody>
                        {d.projects.map((p) => {
                            const open = openProject(p.projectId);
                            return (
                                <tr key={`${p.projectId}-${p.currency}`} className={open ? "click" : undefined} {...clickable(open)}>
                                    <td>
                                        <div className="row" style={{ gap: 9, minWidth: 0 }}>
                                            <ProjectTile icon={p.icon} tint={p.tint} size="sm" />
                                            <div style={{ minWidth: 0 }}>
                                                <div className="trunc" style={{ fontWeight: 600 }}>{p.title}</div>
                                                <div className="muted" style={{ fontSize: "11.5px" }}>
                                                    {p.entries} entr{p.entries === 1 ? "y" : "ies"}{p.madeUpMinutes ? ` · ${fmtH(p.madeUpMinutes)} made up` : ""}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="r mono">{fmtH(p.normalMinutes + p.madeUpMinutes)}</td>
                                    <td className={p.overtimeMinutes ? "r mono ot-text" : "r mono"}>{p.overtimeMinutes ? fmtH(p.overtimeMinutes) : "-"}</td>
                                    <td className="r mono">{cash(p.pay, p.currency)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="hint mt-s">
                {s.basis === "monthly" && s.overtimeThresholdMinutes != null
                    ? "Every hour, overtime too, is priced at the salary's rate that month: the overtime pay is for the month as a whole, so no project carries it."
                    : s.basis === "monthly"
                    ? `Hours are priced at the salary's rate that month, overtime at the overtime rate${multiplier !== 1 ? ` ×${multiplier}` : ""}.`
                    : `Hours are priced at their rate on the day worked${multiplier !== 1 ? `, overtime at ×${multiplier}` : ""}.`}
                {s.basis === "monthly"
                    ? " The salary is paid whatever the projects, and its deductions belong to none, so these don't add up to it."
                    : (d.paidBreakPay > 0 ? " Paid breaks belong to no project, so these don't add up to the pay." : "")}
            </div>
        </div>
    );
}

/** Hours at the rate of the day they were worked, and the paid break of each working day worked. */
function HourlyLines({ detail: d, month }: { detail: SalaryDetail; month: string }) {
    const s = d.salary;
    const cur = s.currency;
    // the company's break that month (not the viewer's own schedule, which a salary:view holder may not have)
    const breakMinutes = policyOn(useWorkingTime().data, `${month.slice(0, 7)}-01`)?.breakMinutes ?? 0;
    return (
        <>
            <div>
                <span>Normal hours · {fmtH(s.normalMinutes)}{s.madeUpMinutes ? ` + ${fmtH(s.madeUpMinutes)} made up from overtime` : ""} at {cash(s.hourlyRate, cur, true)}/h</span>
                <span className="mono">{cash(s.basePay - d.paidBreakPay, cur)}</span>
            </div>
            {d.paidBreakPay > 0 && (
                <div>
                    <span>Paid breaks · {d.paidBreakDays} working day{d.paidBreakDays === 1 ? "" : "s"}{breakMinutes ? ` × ${fmtH(breakMinutes)}` : ""}</span>
                    <span className="mono">{cash(d.paidBreakPay, cur)}</span>
                </div>
            )}
            {d.timeOffPay > 0 && (
                <div>
                    <span>Paid time off</span>
                    <span className="mono">{cash(d.timeOffPay, cur)}</span>
                </div>
            )}
        </>
    );
}

/** Each day's overtime, entry by entry, and how much of it made up missing hours. */
function OvertimeDays({ userId, month }: { userId: number; month: string }) {
    const query = useMyOvertime(month, userId);
    const days = query.data?.days ?? [];
    return (
        <div className="mt">
            <div className="spread">
                <div className="u">Where the overtime happened</div>
                {query.data && <div className="muted" style={{ fontSize: "11.5px" }}>{days.length} day{days.length === 1 ? "" : "s"}</div>}
            </div>
            {loadFailed(query) ? <div className="mt-s"><LoadError error={query.error} retry={() => query.refetch()} what="their overtime" /></div>
                : !query.data ? <div className="mt-s"><SkeletonLines lines={2} /></div>
                    : days.length === 0 ? <div className="hint mt-s">No overtime in {fmtMonthY(month)}.</div> : (
                        <div className="ot-days mt-s">
                            {days.map((day) => (
                                <div key={day.date} className="ot-day">
                                    <div className="ot-day-head">
                                        <b>{fmtDayDate(day.date)}</b>
                                        {day.dayOff && <span className="badge badge-hold">Day off</span>}
                                        <span className="grow" />
                                        <b className="mono ot-text">{fmtDur(day.overtimeMinutes)}</b>
                                    </div>
                                    {day.entries.map((e) => (
                                        <div key={e.workEntryId} className="ot-item" style={{ cursor: "default" }}>
                                            <ProjectTile icon={e.projectIcon} tint={e.projectTint} size="sm" />
                                            <div className="grow" style={{ minWidth: 0 }}>
                                                <div className="trunc">{e.description}</div>
                                                <div className="muted" style={{ fontSize: "11.5px" }}>{e.projectTitle} · <span className="mono">{fmtRange(e.startedAt, e.endedAt)}</span></div>
                                            </div>
                                            <span className="mono muted nowrap" style={{ fontSize: 12 }}>
                                                {fmtDur(e.overtimeMinutes)}{e.overtimeMinutes < e.minutes ? ` of ${fmtDur(e.minutes)}` : ""}
                                                {e.madeUpMinutes ? <div className="hl-made">{fmtDur(e.madeUpMinutes)} made up</div> : null}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
        </div>
    );
}

/** The person's salary advances: each one's status, amount and what it takes this month, and a way to give another. */
function AdvanceSection({ detail: d, month, canGive, onGive, onAdvances }: { detail: SalaryDetail; month: string; canGive: boolean; onGive: () => void; onAdvances: (id?: number) => void }) {
    const advances = d.advances ?? [];
    return (
        <div className="mt">
            <div className="spread">
                <div className="u">Salary advance</div>
                <div className="row" style={{ gap: 8 }}>
                    {advances.length > 0 && <button type="button" className="btn btn-sm btn-quiet" onClick={() => onAdvances()}>See all</button>}
                    {canGive && <button type="button" className="btn btn-sm" onClick={onGive}><Icon name="plus" />Give an advance</button>}
                </div>
            </div>
            {advances.length === 0 ? <div className="hint mt-s">No salary advances.</div> : (
                <div className="pay-lines mt-s">
                    {advances.map((a) => {
                        const thisMonth = a.months.find((m) => monthKey(m.month) === month.slice(0, 7));
                        const takes = thisMonth ? (thisMonth.closed && thisMonth.taken != null ? thisMonth.taken : thisMonth.planned) : null;
                        return (
                            <div key={a.id} {...clickable(() => onAdvances(a.id))} className="click" style={{ alignItems: "center" }}>
                                <span className="row wrap" style={{ gap: 8 }}>
                                    <AdvanceStatusBadge advance={{ status: a.status, left: a.left, settledKind: a.settlement?.kind }} />
                                    <span className="mono">{amountOf(a.amount, a.currency)}</span>
                                </span>
                                <span className="mono muted">{takes != null ? `−${amountOf(takes, a.currency)} this month` : "nothing this month"}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
