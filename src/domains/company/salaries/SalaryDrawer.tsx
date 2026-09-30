import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { canOpen } from "@/app/routing/routeTable";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { Drawer } from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDate, fmtDayDate, fmtDur, fmtH, fmtMonthY, fmtRange } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { HOURS_PER_MONTH } from "@/domains/design/pay/payRules";
import { useMyOvertime, useMySchedule } from "@/domains/design/work/workApi";
import ExcuseHours from "./ExcuseHours";
import { useSalary, type SalaryDetail, type SalaryRow } from "./salariesApi";
import { loadFailed } from "@/api/queryState";

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

    return (
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
                    : <DetailBody detail={d} month={month} multiplier={multiplier} canExcuse={permissions.has(P.HOURS_EXCUSE)} seesWork={permissions.has(P.WORK_ENTRY_VIEW_ALL)} />}
        </Drawer>
    );
}

type BodyProps = { detail: SalaryDetail; month: string; multiplier: number; canExcuse: boolean; seesWork: boolean };

function DetailBody({ detail: d, month, multiplier, canExcuse, seesWork }: BodyProps) {
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
                    : <Kpi label="Hours" value="-" sub={<span>not tracked in Execution</span>} />}
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
                        <HourlyLines detail={d} />
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
                            <span>Overtime · {fmtH(s.overtimeMinutes)}{s.madeUpMinutes ? ` (of ${fmtH(otLogged)} logged)` : ""} at {cash(s.hourlyRate * multiplier, cur, true)}/h{multiplier !== 1 ? ` (×${multiplier})` : ""}</span>
                            <span className="mono">{cash(s.overtimePay, cur)}</span>
                        </div>
                    )}
                    <div className="pay-total"><span>To pay</span><span className="mono">{cash(s.total, cur)}</span></div>
                </div>
                {monthly && (
                    <div className="hint mt-s">
                        Salaried: {s.proRated ? "the salary is pro-rated by the working days they were employed" : "the salary is paid in full"};
                        {" "}hours are priced at {cash(s.amount, cur)} ÷ {HOURS_PER_MONTH.toFixed(1)} h = {cash(s.hourlyRate, cur, true)}/h.
                        {s.deduction > 0 && d.missedDays.length > 0 && !d.inProgress ? " A whole day missed costs the full paid day, its break included." : ""}
                    </div>
                )}
            </div>

            {s.tracksHours && seesWork && <OvertimeDays userId={s.userId} month={month} />}
        </>
    );
}

/** Hours at the rate of the day they were worked, and the paid break of each working day worked. */
function HourlyLines({ detail: d }: { detail: SalaryDetail }) {
    const s = d.salary;
    const cur = s.currency;
    const breakMinutes = useMySchedule(companyToday()).data?.companyWeek.breakMinutes ?? 0;
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
