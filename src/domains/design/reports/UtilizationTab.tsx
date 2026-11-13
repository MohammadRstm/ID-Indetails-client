import { Fragment, useState, type ReactNode } from "react";
import { loadFailed } from "@/api/queryState";
import { BasisNote } from "@/domains/shared/finance/insights/InsightParts";
import HelpHint from "@/domains/shared/help/HelpHint";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Stepper from "@/shared/components/Forms/Stepper";
import { PersonLine } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { addMonths, fmtH, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { ReportPerson } from "./ReportTabs";
import { useUtilization, type Utilization, type UtilizationPerson, type UtilizationTotals } from "./reportsApi";

/** Hours, or a dash for none. */
const hoursOr = (minutes: number) => (minutes ? fmtH(minutes) : "-");
/** The API's utilization as a percentage; a dash when there was nothing to log. */
const utilizationOf = (t: UtilizationTotals) => money.pct(t.utilization);

type UtilizationTabProps = {
    /** "yyyy-MM". */
    month: string;
    /** This month, the last that can be picked. */
    thisMonth: string;
    onMonth: (month: string) => void;
    /** The page's tabs, shown between the figures and the tables as on the other tabs. */
    tabs: ReactNode;
    people: Map<number, ReportPerson>;
};

/**
 * The Reports page's Utilization tab: how much of their expected hours Design employees logged in a month, each
 * department and each person, with where each person's hours went. Hours only, never pay; every figure and
 * percentage is the API's.
 */
export default function UtilizationTab({ month, thisMonth, onMonth, tabs, people }: UtilizationTabProps) {
    const query = useUtilization(month);
    const failed = loadFailed(query);
    const u = query.data;
    return (
        <>
            <div className="filters">
                <Stepper label={fmtMonthY(`${month}-01`)} onPrev={() => onMonth(addMonths(month, -1))} onNext={() => onMonth(addMonths(month, 1))}
                    nextDisabled={month >= thisMonth} minWidth={150} />
                <div className="grow" />
                {u?.inProgress && <span className="muted" style={{ fontSize: 12.5 }}>So far: this month runs to today.</span>}
            </div>

            {failed ? <div className="panel"><div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the utilization" /></div></div> : (
                <KpiStrip loading={!u} items={[
                    { key: "logged", label: "Hours logged", value: u ? fmtH(u.total.loggedMinutes) : "-" },
                    { key: "expected", label: "Expected hours", value: u ? fmtH(u.total.expectedMinutes) : "-" },
                    { key: "excused", label: "Excused", value: u ? hoursOr(u.total.excusedMinutes) : "-" },
                    { key: "available", label: "Available", value: u ? hoursOr(u.total.availableMinutes) : "-", hint: "Expected hours less excused hours: what there was to log." },
                    { key: "overtime", label: "Overtime", value: u ? hoursOr(u.total.overtimeMinutes) : "-" },
                    { key: "utilization", label: "Utilization", value: u ? utilizationOf(u.total) : "-", hint: "Hours logged ÷ available hours. Overtime can take it past 100%." },
                ]} />
            )}

            {tabs}

            {failed ? null : !u ? <div className="panel"><div className="panel-body"><SkeletonLines lines={8} /></div></div> : (
                <>
                    <Departments utilization={u} />
                    <People utilization={u} people={people} />
                </>
            )}
        </>
    );
}

function Departments({ utilization: u }: { utilization: Utilization }) {
    return (
        <div className="panel" role="region" aria-label="Utilization by department">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">
                        By department
                        <HelpHint article="utilization" label="utilization">Utilization is the hours logged ÷ the hours there were to log: the expected hours of the month's working days, less excused time. It's about hours only, never pay.</HelpHint>
                    </div>
                    <div className="panel-sub">Each department's hours in {fmtMonthY(u.month)}, by the department its people are in today.</div>
                </div>
            </div>
            {u.departments.length === 0 ? <div className="panel-body"><Empty art="time" title="No Design employees in this month" /></div> : (
                <div className="tbl-wrap">
                    <table className="tbl tbl-min-sm" aria-label="Utilization by department">
                        <thead>
                            <tr><th>Department</th><th className="r">People</th><th className="r">Logged</th><th className="r">Expected</th><th className="r">Excused</th><th className="r">Overtime</th><th className="r">Utilization</th></tr>
                        </thead>
                        <tbody>
                            {u.departments.map((d) => (
                                <tr key={d.teamId ?? "none"}>
                                    <td><b>{d.name}</b></td>
                                    <td className="r num">{d.people}</td>
                                    <HourCells hours={d.hours} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/** Logged, expected, excused, overtime and utilization: the same five cells on every row. */
function HourCells({ hours: h }: { hours: UtilizationTotals }) {
    return (
        <>
            <td className="r mono">{hoursOr(h.loggedMinutes)}</td>
            <td className="r mono">{hoursOr(h.expectedMinutes)}</td>
            <td className="r mono muted">{hoursOr(h.excusedMinutes)}</td>
            <td className={h.overtimeMinutes ? "r mono ot-text" : "r mono muted"}>{hoursOr(h.overtimeMinutes)}</td>
            <td className="r num"><b>{utilizationOf(h)}</b></td>
        </>
    );
}

/** Each person's hours, opening onto the projects they went to. Hours only: never a person's pay. */
function People({ utilization: u, people }: { utilization: Utilization; people: Map<number, ReportPerson> }) {
    const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
    const toggle = (id: number) => setOpen((o) => {
        const next = new Set(o);
        if (!next.delete(id)) next.add(id);
        return next;
    });
    return (
        <div className="panel mt" role="region" aria-label="Utilization by person">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">By person</div>
                    <div className="panel-sub">Each Design employee's hours in {fmtMonthY(u.month)}. Open a person to see where their hours went.</div>
                </div>
            </div>
            {u.people.length === 0 ? <div className="panel-body"><Empty art="time" title="No Design employees in this month" text="Admins and site staff don't log hours, so they aren't listed." /></div> : (
                <div className="tbl-wrap">
                    <table className="tbl tbl-min" aria-label="Utilization by person">
                        <thead>
                            <tr><th>Employee</th><th>Department</th><th className="r">Logged</th><th className="r">Expected</th><th className="r">Excused</th><th className="r">Overtime</th><th className="r">Utilization</th></tr>
                        </thead>
                        <tbody>
                            {u.people.map((p) => (
                                <PersonRows key={p.userId} person={p} known={people.get(p.userId)} open={open.has(p.userId)} onToggle={() => toggle(p.userId)} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="panel-foot"><BasisNote basis={u.basis} label="How utilization is worked out" /></div>
        </div>
    );
}

type PersonRowsProps = { person: UtilizationPerson; known?: ReportPerson; open: boolean; onToggle: () => void };

function PersonRows({ person: p, known, open, onToggle }: PersonRowsProps) {
    return (
        <Fragment>
            <tr aria-label={p.name}>
                <td>
                    <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="icon-btn" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${p.name}'s projects`} onClick={onToggle}>
                            <Icon name={open ? "chevronDown" : "chevronRight"} />
                        </button>
                        <PersonLine person={known ?? { id: p.userId, name: p.name }} size={24} sub={false} />
                    </div>
                </td>
                <td className="muted">{p.department ?? "No department"}</td>
                <HourCells hours={p.hours} />
            </tr>
            {open && (
                <tr>
                    <td colSpan={7} style={{ paddingLeft: 48 }}>
                        {p.projects.length === 0 ? <span className="muted">No hours logged on a project in this month.</span> : (
                            <table className="tbl" aria-label={`${p.name}'s projects`}>
                                <thead><tr><th>Project</th><th className="r">Hours</th><th className="r">Share of their hours</th></tr></thead>
                                <tbody>
                                    {p.projects.map((x) => (
                                        <tr key={x.projectId}>
                                            <td>{x.title}</td>
                                            <td className="r mono">{fmtH(x.minutes)}</td>
                                            <td className="r num">{money.pct(x.share)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </td>
                </tr>
            )}
        </Fragment>
    );
}
