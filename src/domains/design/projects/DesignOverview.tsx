import { useState } from "react";
import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Delta, RankBars, Spark } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { HourHeat } from "@/shared/components/Charts/Heat";
import LineChart, { type LineSeries } from "@/shared/components/Charts/LineChart";
import { Bar } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { MixedCurrency, Money } from "@/shared/components/Data/Money";
import { activityLevelOf } from "@/shared/components/Data/activity";
import { SortTh, type SortState } from "@/shared/components/Data-Tables/DataTable";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import { Avatars, PersonAvatar, PersonLine } from "@/shared/components/Identity/People";
import useDebounce from "@/shared/hooks/useDebounce";
import { money } from "@/shared/format/money";
import { addDays, dayKey, daysBetween, fmtDate, fmtDateY, fmtDur, fmtDurShort, fmtH, fmtNumber, relDay, startOfWeek } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { useDomainPeople } from "../../shared/people/peopleApi";
import type { Project } from "../../shared/projects/projectsApi";
import { companyNow } from "../work/day";
import ContributorDrawer, { type WorkRange } from "./ContributorDrawer";
import { rangeOptions, type RangeKey } from "./ranges";
import EntryModal from "./EntryModal";
import { useLatestEntry, useProjectTimeline, useProjectWork, type Contributor, type ProjectWork } from "./projectWorkApi";
import BillingBand from "../../shared/billing/BillingBand";
import PaymentSection from "../../shared/projects/PaymentSection";
import FinancialBreakdown, { CostFigures } from "./money/FinancialBreakdown";
import MoneyBand from "./money/MoneyBand";
import { useProjectExpenses } from "./money/moneyApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

const ACTIVITY = ["No activity", "Quiet", "Steady", "Busy"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Someone who sees neither the money nor everyone's work: the project's progress on its own. */
export function DesignProgress({ project }: { project: Project }) {
    return <Kpis project={project} work={undefined} />;
}

/**
 * A Design project's Financials tab: its customer payment first, then its profit, where the cost sits, the client's
 * payments and invoices, and the breakdown.
 */
export function DesignFinancials({ project }: { project: Project }) {
    const permissions = usePermissions();
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const [drawer, setDrawer] = useState<number | null>(null);
    const [entry, setEntry] = useState<number | null>(null);
    const all = useProjectWork(project.id, {}, seesWork);
    const m = permissions.has(P.FINANCIAL_VIEW) ? project.money : null;
    const expenses = useProjectExpenses(project.id, !!m);
    const [params, setParams] = useSearchParams();
    const open = (key: string, value: string) => () => { params.set(key, value); setParams(params); };
    const closed = project.status === "completed" || project.status === "archived";
    if (!m) return null;
    const onAddExpense = permissions.has(P.EXPENSE_MANAGE) ? open("money", "expense") : undefined;
    const allRange = rangeOptions(project, companyNow().today).all;
    const clientWork = project.billingType === "client";
    const canEditMoney = permissions.has(P.PROJECT_EDIT) && !m.isLocked;

    return (
        <>
            <PaymentSection label="Customer payment" amount={clientWork ? m.revenue : null} locked={m.isLocked}
                sub={clientWork ? "The total the client pays for this project. Each change is kept with why it changed." : undefined}
                onEdit={clientWork && canEditMoney ? open("money", "payment") : undefined}
                onHistory={clientWork ? open("money", "history") : undefined}
                empty={(
                    <span className="row" style={{ gap: 10 }}>
                        Internal project - no client and no payment.
                        {canEditMoney && <button className="btn btn-sm" onClick={open("money", "client")}>Make it client work</button>}
                    </span>
                )} />
            <MoneyBand project={project} money={m} contributors={all.data?.contributorCount} expenseCount={expenses.data?.items.length}
                onEditPayment={clientWork && canEditMoney ? open("money", "payment") : undefined} onAddExpense={onAddExpense}
                onCloseProject={permissions.has(P.PROJECT_CHANGE_STATUS) && !closed ? open("complete", "1") : undefined} />
            {project.billingType === "client" && <BillingBand project={project} />}
            <FinancialBreakdown project={project} money={m} contributors={seesWork ? all.data?.contributors : undefined} entryCount={all.data?.entryCount}
                expenses={expenses.data?.items} expensesFailed={expenses.isError && !expenses.data ? { error: expenses.error, retry: () => void expenses.refetch() } : null}
                onPerson={seesWork ? setDrawer : undefined} onAddExpense={onAddExpense}
                canRemoveExpenses={permissions.has(P.EXPENSE_MANAGE)} />
            {drawer != null && (
                <ContributorDrawer projectId={project.id} projectTitle={project.title} personId={drawer} range={allRange} workQ=""
                    onOpenEntry={setEntry} onClose={() => setDrawer(null)} />
            )}
            {entry != null && <EntryModal entryId={entry} overDrawer={drawer != null} onClose={() => setEntry(null)} />}
        </>
    );
}

/** A Design project's Analytics tab, for those who see everyone's work: the work KPIs and the charts. */
export function DesignAnalytics({ project }: { project: Project }) {
    const [drawer, setDrawer] = useState<number | null>(null);
    const [entry, setEntry] = useState<number | null>(null);
    const all = useProjectWork(project.id, {});
    const allRange = rangeOptions(project, companyNow().today).all;

    return (
        <>
            {loadFailed(all) ? <div className="panel"><div className="panel-body"><LoadError error={all.error} retry={() => all.refetch()} what="the project's work" /></div></div>
                : <Kpis project={project} work={all.data} />}

            <Analytics project={project} work={all.data} contributors={all.data?.contributors ?? []} onPerson={setDrawer} />

            {drawer != null && (
                <ContributorDrawer projectId={project.id} projectTitle={project.title} personId={drawer} range={allRange} workQ=""
                    onOpenEntry={setEntry} onClose={() => setDrawer(null)} />
            )}
            {entry != null && <EntryModal entryId={entry} overDrawer={drawer != null} onClose={() => setEntry(null)} />}
        </>
    );
}

/** A Design project's Contributors tab: who put the hours in. */
export function DesignContributors({ project }: { project: Project }) {
    const { today } = companyNow();
    const [drawer, setDrawer] = useState<number | null>(null);
    const [entry, setEntry] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [workQ, setWorkQ] = useState("");
    const [rangeKey, setRangeKey] = useState<RangeKey>("all");
    const ranges = rangeOptions(project, today);
    const range = ranges[rangeKey];
    const text = useDebounce({ value: workQ.trim(), debounceTimeMs: 250 });
    const filtered = useProjectWork(project.id, { from: range.from, to: range.to, search: text || undefined });

    return (
        <>
            <Contributors work={filtered.data} error={loadFailed(filtered) ? filtered.error : null} retry={() => filtered.refetch()} range={range} rangeKey={rangeKey} ranges={ranges}
                setRangeKey={setRangeKey} search={search} setSearch={setSearch} workQ={workQ} setWorkQ={setWorkQ} onPerson={setDrawer} />
            {drawer != null && (
                <ContributorDrawer projectId={project.id} projectTitle={project.title} personId={drawer} range={range} workQ={workQ}
                    onOpenEntry={setEntry} onClose={() => setDrawer(null)} />
            )}
            {entry != null && <EntryModal entryId={entry} overDrawer={drawer != null} onClose={() => setEntry(null)} />}
        </>
    );
}

/** The KPI strip: hours, entries, contributors, progress, payment, last activity and pace. */
function Kpis({ project, work: w }: { project: Project; work: ProjectWork | undefined }) {
    const permissions = usePermissions();
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const latest = useLatestEntry(project.id, seesWork);
    const m = permissions.has(P.FINANCIAL_VIEW) && project.billingType === "client" ? project.money : null;
    const b = m?.billing;
    const last = latest.data;
    const progress = { key: "progress", label: "Progress", value: `${project.progressPct}%`, sub: <div style={{ width: 88 }}><Bar value={project.progressPct} hideValue /></div> };
    if (!seesWork) return <KpiStrip items={[progress]} />;
    const normal = (w?.totalMinutes ?? 0) - (w?.totalOvertimeMinutes ?? 0);

    return (
        <KpiStrip loading={!w} items={[
            {
                key: "hours", label: "Total hours", value: fmtH(w?.totalMinutes ?? 0),
                sub: w?.totalOvertimeMinutes ? <span>{fmtH(normal)} normal · <span className="ot-text">{fmtH(w.totalOvertimeMinutes)} overtime</span></span> : undefined,
                delta: w && <Delta value={w.minutesLast14Days} prev={w.minutesPrevious14Days} label="last 14 days vs previous" />,
            },
            { key: "entries", label: "Work entries", value: fmtNumber(w?.entryCount ?? 0), sub: <span>avg {w?.entryCount ? fmtDur(w.totalMinutes / w.entryCount) : "-"} per entry</span> },
            {
                key: "people", label: "Contributors", value: w?.contributorCount ?? 0,
                sub: <Avatars people={(w?.contributors ?? []).map((c) => ({ id: c.userId, name: c.name }))} max={6} link />,
            },
            progress,
            ...(m && b ? [{
                key: "payment", label: "Payment status",
                value: b.invoiced <= 0 ? "Not invoiced" : b.outstanding > 0.5 ? <Money short value={b.outstanding} /> : "Paid",
                sub: (
                    <span className={b.overdue > 0.5 ? "down" : ""}>
                        {b.invoiced <= 0 ? `${money.short(m.revenue)} still to bill`
                            : b.outstanding > 0.5 ? `${b.overdue > 0.5 ? "overdue · " : "outstanding · "}${money.short(b.received)} received`
                                : `${money.short(b.received)} received in full`}
                    </span>
                ),
            }] : []),
            {
                key: "last", label: "Last activity", value: w?.lastStartedAt ? relDay(w.lastStartedAt) : "-",
                sub: <span>{last ? `${last.person.name.split(" ")[0]} · ${fmtDurShort(last.minutes)}` : "no work logged"}</span>,
            },
            { key: "activity", label: "Activity", value: ACTIVITY[activityLevelOf(w?.activityLevel)], sub: <span>{fmtH((w?.minutesLast14Days ?? 0) / 2)} per week (14-day average)</span> },
        ]} />
    );
}

type ContributorsProps = {
    work: ProjectWork | undefined;
    error: unknown;
    retry: () => void;
    range: WorkRange;
    rangeKey: RangeKey;
    ranges: Record<RangeKey, WorkRange>;
    setRangeKey: (k: RangeKey) => void;
    search: string;
    setSearch: (v: string) => void;
    workQ: string;
    setWorkQ: (v: string) => void;
    onPerson: (id: number) => void;
};

/** "Contributors": who put the hours in, filtered by range and work text (the prototype's contributors table). */
function Contributors({ work, error, retry, range, rangeKey, ranges, setRangeKey, search, setSearch, workQ, setWorkQ, onPerson }: ContributorsProps) {
    const permissions = usePermissions();
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    const [showCost, setShowCost] = useState(false);
    const [sort, setSort] = useState<SortState>({ key: "hours", dir: "desc" });
    // positions, under each name
    const people = useDomainPeople("design", permissions.has(P.EMPLOYEE_VIEW));
    const positionOf = new Map((people.data ?? []).map((p) => [p.id, p.position]));
    const sq = search.trim().toLowerCase();
    const dir = sort.dir === "desc" ? 1 : -1;
    const list = (work?.contributors ?? [])
        .filter((c) => !sq || c.name.toLowerCase().includes(sq))
        .sort((a, b) => {
            if (sort.key === "entries") return (b.entries - a.entries) * dir;
            if (sort.key === "recent") return b.lastStartedAt.localeCompare(a.lastStartedAt) * dir;
            if (sort.key === "name") return a.name.localeCompare(b.name) * -dir;
            return (b.minutes - a.minutes) * dir;
        });
    const total = list.reduce((s, c) => s + c.minutes, 0);
    const totalCost = list.reduce((s, c) => s + (c.labourCost?.usd ?? 0), 0);
    const entries = list.reduce((s, c) => s + c.entries, 0);
    const share = (c: Contributor) => (showCost ? (totalCost ? Math.round(((c.labourCost?.usd ?? 0) / totalCost) * 100) : 0) : total ? Math.round((c.minutes / total) * 100) : 0);
    const clear = () => { setSearch(""); setWorkQ(""); setRangeKey("all"); };

    return (
        <div className="panel">
            <div className="panel-head">
                <div className="grow" style={{ minWidth: 180 }}>
                    <div className="panel-title">Contributors</div>
                    <div className="panel-sub">Who put the hours in. Click a person to see their entries on this project.</div>
                </div>
                <div className="panel-tools">
                    <SearchInput width={150} value={search} onChange={setSearch} placeholder="Find person" />
                    <SearchInput width={160} icon="filter" value={workQ} onChange={setWorkQ} placeholder="Filter work text" />
                    <Select className="select sm" style={{ width: 150 }} aria-label="Range" value={rangeKey} onChange={setRangeKey}
                        options={(Object.keys(ranges) as RangeKey[]).map((k) => ({ value: k, label: ranges[k].label }))} />
                    {seesMoney && (
                        <Segmented value={showCost ? "cost" : "hours"} onChange={(v) => setShowCost(v === "cost")} aria-label="Share of"
                            options={[{ value: "hours", label: "Hours" }, { value: "cost", label: "Cost" }]} />
                    )}
                </div>
            </div>
            {error ? <div className="panel-body"><LoadError error={error} retry={retry} what="the contributors" /></div> : !work ? <div className="panel-body"><SkeletonLines lines={4} /></div> : (
                <>
                    <div className="tbl-wrap">
                        <table className="tbl tbl-min-sm">
                            <thead>
                                <tr>
                                    <SortTh sortKey="name" sort={sort} onSort={setSort}>Employee</SortTh>
                                    <SortTh sortKey="entries" sort={sort} onSort={setSort} right>Entries</SortTh>
                                    <th className="r" title="Hours inside the working day">Normal</th>
                                    <th className="r" title="Outside the working day, on a day off, or past what the day asks for">Overtime</th>
                                    <SortTh sortKey="hours" sort={sort} onSort={setSort} right>Total</SortTh>
                                    {seesMoney && <th className="r">Labour cost</th>}
                                    <th style={{ width: 120 }}>{showCost ? "Share of cost" : "Share"}</th>
                                    <th>Last 8 weeks</th>
                                    <SortTh sortKey="recent" sort={sort} onSort={setSort}>Last activity</SortTh>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((c) => (
                                    <tr key={c.userId} className="click" {...clickable(() => onPerson(c.userId))}>
                                        <td><PersonLine person={{ id: c.userId, name: c.name }} size={28} link sub={positionOf.get(c.userId) ?? false} /></td>
                                        <td className="r num">{c.entries}</td>
                                        <td className="r mono">{fmtDur(c.minutes - c.overtimeMinutes)}</td>
                                        <td className={cx("r mono", c.overtimeMinutes ? "ot-text" : "muted")}>{c.overtimeMinutes ? fmtDur(c.overtimeMinutes) : "-"}</td>
                                        <td className="r mono" style={{ fontWeight: 600 }}>{fmtDur(c.minutes)}</td>
                                        {seesMoney && (
                                            <td className="r mono">
                                                {money.fmt(c.labourCost?.usd ?? 0)}
                                                {c.labourCost?.unconverted.length ? <div><MixedCurrency amounts={c.labourCost.unconverted} /></div> : null}
                                            </td>
                                        )}
                                        <td>
                                            <div className="meter-row">
                                                <div className="bar"><i style={{ width: `${share(c)}%` }} /></div>
                                                <span className="meter-val">{share(c)}%</span>
                                            </div>
                                        </td>
                                        <td><Spark values={c.weekly} width={64} height={18} /></td>
                                        <td className="nowrap muted">{relDay(c.lastStartedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {list.length === 0 && (
                        <Empty art="search" title="No contributions match these filters" text="Widen the date range or clear the work-text filter."
                            action={<button className="btn" onClick={clear}>Clear filters</button>} />
                    )}
                    {list.length > 0 && (
                        <div className="panel-foot">
                            <span>{list.length} contributors · {fmtNumber(entries)} entries · {fmtH(total)}</span>
                            <div className="grow" />
                            <span className="muted">{range.label}{workQ ? ` · work text contains "${workQ}"` : ""}</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** The charts: hours per week, contribution share, when work happens, hours vs plan, and cost over time for those who see money. */
function Analytics({ project, work: w, contributors, onPerson }: { project: Project; work: ProjectWork | undefined; contributors: Contributor[]; onPerson: (id: number) => void }) {
    const permissions = usePermissions();
    const m = permissions.has(P.FINANCIAL_VIEW) ? project.money : null;
    const total = contributors.reduce((s, c) => s + c.minutes, 0);
    const top3 = contributors.slice().sort((a, b) => b.minutes - a.minutes).slice(0, 3).reduce((s, c) => s + c.minutes, 0);
    const weekly = w?.weekly ?? [];
    const grid = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
    for (const cell of w?.hourHeat ?? []) grid[WEEKDAYS.indexOf(cell.weekday)][cell.hour] += cell.minutes;
    const labelEvery = Math.max(1, Math.ceil(weekly.length / 6));

    return (
        <>
            <div className="grid g-2 mt">
                <Figure title="Hours per week" sub="Where the effort actually landed across the project's life."
                    table={{ cols: [{ label: "Week of" }, { label: "Hours", right: true }, { label: "Entries", right: true }], rows: weekly.map((x) => [fmtDateY(x.weekStart), (x.minutes / 60).toFixed(1), x.entries]) }}>
                    <Columns height={180} labelEvery={labelEvery} format={(v) => `${Math.round(v)}h`}
                        data={weekly.map((x) => ({ label: fmtDate(x.weekStart), tip: `Week of ${fmtDateY(x.weekStart)}`, value: x.minutes / 60, note: `${x.entries} entries` }))} />
                </Figure>
                <Figure title="Contribution share" sub="How the work is distributed across the team."
                    table={{ cols: [{ label: "Employee" }, { label: "Hours", right: true }, { label: "Share", right: true }], rows: contributors.map((c) => [c.name, fmtDur(c.minutes), `${total ? Math.round((c.minutes / total) * 100) : 0}%`]) }}>
                    <RankBars showPct onClick={(it) => onPerson(Number(it.id))}
                        items={contributors.slice(0, 9).map((c) => ({
                            id: c.userId, label: c.name, value: c.minutes,
                            node: <><PersonAvatar person={{ id: c.userId, name: c.name }} size={20} link={false} /><span className="trunc">{c.name}</span></>,
                        }))} />
                    <div className="chart-note">Top 3 contributors account for {total ? Math.round((top3 / total) * 100) : 0}% of logged hours.</div>
                </Figure>
            </div>
            <div className="grid g-2 mt">
                <Figure title="When work happens" sub="Logged time by weekday and hour - useful for spotting crunch.">
                    <HourHeat grid={grid} />
                </Figure>
                <Figure title="Cumulative hours vs plan" sub={project.targetDate ? "Actual hours against a straight-line plan to the target date." : "Hours accumulated since the project started."}>
                    <BurnUp project={project} />
                </Figure>
            </div>
            {m && <CostFigures project={project} money={m} />}
        </>
    );
}

/** Hours accumulated week by week, against a straight-line pace (the prototype's BurnUp). */
function BurnUp({ project }: { project: Project }) {
    const { today } = companyNow();
    const timeline = useProjectTimeline(project.id);
    if (loadFailed(timeline)) return <LoadError error={timeline.error} retry={() => timeline.refetch()} what="the hours so far" />;
    if (!timeline.data) return <SkeletonLines lines={4} />;
    const completed = project.completedAt ? dayKey(project.completedAt) : null;
    const end = completed ?? (project.targetDate && project.targetDate > today ? project.targetDate : today);
    const weeks = Math.min(40, Math.max(3, Math.ceil((daysBetween(project.startDate, end) + 1) / 7)));
    const s0 = startOfWeek(project.startDate);
    const byDay = new Map(timeline.data.days.map((d) => [d.day, d.minutes]));
    const minutesIn = (a: string, b: string) => {
        let m = 0;
        for (let k = a; k <= b; k = addDays(k, 1)) m += byDay.get(k) ?? 0;
        return m;
    };
    const totalNow = minutesIn(project.startDate, today) / 60;
    const planTotal = project.progressPct > 0 ? (totalNow / Math.max(5, project.progressPct)) * 100 : totalNow;
    const actual = [], plan = [];
    let cum = 0;
    for (let i = 0; i < weeks; i++) {
        const ws = addDays(s0, i * 7), we = addDays(ws, 6);
        const label = fmtDate(ws), tipText = `Week of ${fmtDateY(ws)}`;
        if (ws <= today) {
            cum += minutesIn(ws, we) / 60;
            actual.push({ y: cum, label, tip: tipText });
        }
        plan.push({ y: (planTotal * (i + 1)) / weeks, label, tip: tipText });
    }
    const series: LineSeries[] = [
        { label: "Actual hours", points: actual, area: true },
        { label: completed ? "Straight-line pace" : "Pace needed for target", points: plan, ghost: true, dash: true },
    ];
    return (
        <div>
            <LineChart series={series} height={190} tickEvery={Math.max(1, Math.ceil(plan.length / 6))} format={(v) => `${Math.round(v)}h`} />
            <div className="chart-note">
                The dashed line is a simple straight-line pace, not an estimate: there are no hour budgets yet.
            </div>
        </div>
    );
}
