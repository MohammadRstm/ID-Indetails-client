import { useState } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import { CompositionBar, ProfitBars, RankBars, Spark } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import { MixedCurrency } from "@/shared/components/Data/Money";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SearchInput } from "@/shared/components/Forms/Filters";
import Avatar from "@/shared/components/Identity/Avatar";
import { PersonLine, type Person } from "@/shared/components/Identity/People";
import useDebounce from "@/shared/hooks/useDebounce";
import { money } from "@/shared/format/money";
import { quarterLabel, quarterOf } from "@/shared/format/periods";
import { companyToday, fmtDate, fmtDateY, fmtDur, fmtH, fmtMonthY, fmtNumber, fmtRange, MONTHS } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { useFinanceMonthly } from "../../shared/finance/financeApi";
import { useReportEntries, type ReportScope, type WorkReport } from "./reportsApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

export type Tile = { icon: string | null; tint: string | null };
export type ReportPerson = Person & { team?: string | null };

export type TabProps = {
    report: WorkReport;
    /** "Q3 2026", "Last 30 days". */
    label: string;
    tiles: Map<number, Tile>;
    people: Map<number, ReportPerson>;
};

/** Opens a Design page when the viewer may, otherwise leaves the bar or row still. */
function useOpener() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    return (path: string) => (canOpen(permissions, "design", path) ? () => navigate(`/design/${path}`) : undefined);
}

const personOf = (people: Map<number, ReportPerson>, id: number, name: string): ReportPerson => people.get(id) ?? { id, name };

export function OverviewTab({ report, label, tiles, people }: TabProps) {
    const open = useOpener();
    const current = quarterOf(companyToday());
    const weekly = report.weekly;
    const quarters = report.quarterly.map((q) => {
        const { year, quarter } = quarterOf(q.quarterStart);
        return {
            label: `Q${quarter} ’${String(year).slice(2)}`, tip: quarterLabel(year, quarter), value: q.minutes / 60,
            muted: !(year === current.year && quarter === current.quarter),
        };
    });
    const clientPath = (id: string | number | undefined) => (id == null || id === "internal" ? undefined : open(`clients/${id}`));

    return (
        <>
            <div className="grid g-8-4">
                <Figure title="Hours per week" sub={`All logged time in ${label}.`}
                    table={{ cols: [{ label: "Week of" }, { label: "Hours", right: true }, { label: "Entries", right: true }], rows: weekly.map((w) => [fmtDateY(w.weekStart), (w.minutes / 60).toFixed(1), w.entries]) }}>
                    <Columns height={200} labelEvery={Math.max(1, Math.ceil(weekly.length / 8))} format={(v) => `${Math.round(v)}h`}
                        data={weekly.map((w) => ({ label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}`, value: w.minutes / 60, note: `${w.entries} entries` }))} />
                </Figure>
                <Figure title="Quarterly comparison" sub="Total hours logged per quarter.">
                    <Columns height={200} data={quarters} format={(v) => `${Math.round(v)}h`} labelEvery={1} />
                    <div className="chart-note">The current quarter is still in progress, so its bar is partial.</div>
                </Figure>
            </div>

            <div className="grid g-2 mt">
                <Figure title="Hours by project" sub={label}
                    table={{ cols: [{ label: "Project" }, { label: "Hours", right: true }, { label: "Entries", right: true }], rows: report.byProject.map((p) => [p.title, fmtDur(p.minutes), p.entries]) }}>
                    <RankBars showPct onClick={(it) => open(`projects/${it.id}`)?.()}
                        items={report.byProject.slice(0, 8).map((p) => ({
                            id: p.projectId, label: p.title, value: p.minutes,
                            node: <><ProjectTile icon={tiles.get(p.projectId)?.icon} tint={tiles.get(p.projectId)?.tint} size="sm" /><span className="trunc">{p.title}</span></>,
                        }))} />
                </Figure>
                <Figure title="Hours by client" sub={`Where our capacity went · ${label}`}
                    table={{ cols: [{ label: "Client" }, { label: "Hours", right: true }], rows: report.byClient.map((c) => [c.name ?? "Internal work", fmtH(c.minutes)]) }}>
                    <RankBars format={fmtH} unit="Hours" showPct onClick={(it) => clientPath(it.id)?.()}
                        items={report.byClient.map((c) => ({ id: c.clientId ?? "internal", label: c.name ?? "Internal work", value: c.minutes }))} />
                </Figure>
                <Figure title="Hours by employee" sub={label}
                    table={{ cols: [{ label: "Employee" }, { label: "Hours", right: true }, { label: "Entries", right: true }], rows: report.byPerson.map((p) => [p.name, fmtDur(p.minutes), p.entries]) }}>
                    <RankBars showPct onClick={(it) => open(`people/${it.id}`)?.()}
                        items={report.byPerson.slice(0, 8).map((p) => ({
                            id: p.userId, label: p.name, value: p.minutes,
                            node: <><Avatar person={personOf(people, p.userId, p.name)} size={20} /><span className="trunc">{p.name}</span></>,
                        }))} />
                </Figure>
            </div>

            <div className="panel mt">
                <div className="panel-head">
                    <div><div className="panel-title">Projects completed in {label}</div><div className="panel-sub">Duration measured from start date to completion date.</div></div>
                </div>
                <div className="tbl-wrap">
                    <table className="tbl tbl-min-sm">
                        <thead><tr><th>Project</th><th>Started</th><th>Completed</th><th className="r">Days</th><th className="r">Hours</th><th className="r">People</th></tr></thead>
                        <tbody>
                            {report.completedProjects.map((p) => (
                                <tr key={p.projectId} className={cx(open(`projects/${p.projectId}`) && "click")} {...clickable(open(`projects/${p.projectId}`))}>
                                    <td><div className="pname"><ProjectTile icon={tiles.get(p.projectId)?.icon} tint={tiles.get(p.projectId)?.tint} size="sm" /><b>{p.title}</b></div></td>
                                    <td className="muted nowrap">{fmtDateY(p.startDate)}</td>
                                    <td className="muted nowrap">{fmtDateY(p.completedOn)}</td>
                                    <td className="r num">{p.days}</td>
                                    <td className="r mono">{fmtH(p.minutes)}</td>
                                    <td className="r num">{p.people}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {report.completedProjects.length === 0 && <Empty art="done" title="No projects were completed in this period" text="Change the period to see closed projects." />}
            </div>
        </>
    );
}

export function ProjectsTab({ report, label, tiles }: TabProps) {
    const open = useOpener();
    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Project activity</div>
                    <div className="panel-sub">Each row shows that project's weekly rhythm inside {label} - small multiples rather than one crowded stack.</div>
                </div>
            </div>
            <div className="tbl-wrap">
                <table className="tbl tbl-min">
                    <thead><tr><th>Project</th><th>Status</th><th className="r">Hours</th><th className="r">Entries</th><th className="r">People</th><th className="r">Share</th><th>Weekly rhythm</th></tr></thead>
                    <tbody>
                        {report.byProject.map((p) => (
                            <tr key={p.projectId} className={cx(open(`projects/${p.projectId}`) && "click")} {...clickable(open(`projects/${p.projectId}`))}>
                                <td><div className="pname"><ProjectTile icon={tiles.get(p.projectId)?.icon} tint={tiles.get(p.projectId)?.tint} size="sm" /><b className="trunc">{p.title}</b></div></td>
                                <td><StatusBadge status={p.status} /></td>
                                <td className="r mono">{fmtH(p.minutes)}</td>
                                <td className="r num">{p.entries}</td>
                                <td className="r num">{p.people}</td>
                                <td className="r num">{p.sharePct}%</td>
                                <td><Spark values={p.weekly} width={110} height={20} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {report.byProject.length === 0 && <Empty art="time" title="No work logged in this period" />}
        </div>
    );
}

export function PeopleTab({ report, label, people }: TabProps) {
    const open = useOpener();
    const { projects, rows } = report.matrix;
    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Where each person's time went</div>
                    <div className="panel-sub">Hours per employee per project inside {label}. Darker means more hours.</div>
                </div>
            </div>
            <div className="tbl-wrap">
                <table className="tbl tbl-min">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            {projects.map((p) => <th key={p.projectId} className="r" style={{ maxWidth: 90 }}>{p.title}</th>)}
                            <th className="r" title="Outside the working day, on a day off, or past what the day asks for">Overtime</th>
                            <th className="r">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const person = personOf(people, r.userId, r.name);
                            return (
                                <tr key={r.userId} className={cx(open(`people/${r.userId}`) && "click")} {...clickable(open(`people/${r.userId}`))}>
                                    <td><PersonLine person={person} size={26} sub={person.team ?? false} /></td>
                                    {r.cells.map((mins, i) => {
                                        const lvl = mins ? Math.min(4, Math.max(1, Math.ceil((mins / Math.max(1, r.totalMinutes)) * 4))) : 0;
                                        return (
                                            <td key={projects[i]?.projectId ?? i} className="r">
                                                <span className={cx("badge", `lv${lvl}`)} style={{ color: mins ? `var(--on-lv${lvl})` : "var(--ink-3)", minWidth: 54, justifyContent: "flex-end" }}>
                                                    {mins ? fmtH(mins) : "-"}
                                                </span>
                                            </td>
                                        );
                                    })}
                                    <td className={cx("r mono", r.overtimeMinutes ? "ot-text" : "muted")}>{r.overtimeMinutes ? fmtH(r.overtimeMinutes) : "-"}</td>
                                    <td className="r mono"><b>{fmtH(r.totalMinutes)}</b></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="panel-foot"><span className="muted">Only the six busiest projects of the period are shown as columns; the total covers every project.</span></div>
        </div>
    );
}

export function MoneyTab({ report, people }: TabProps) {
    const open = useOpener();
    const months = useFinanceMonthly("design", 8, true);
    const m = report.money;
    if (!m) return null;
    return (
        <div>
            <div className="kpis">
                <Kpi label="Labour cost" value={money.short(m.labour.usd)} sub={<span>{fmtH(report.totalMinutes)} in range</span>} />
                <Kpi label="Project expenses" value={money.short(m.expensesUsd)} />
                <Kpi label="Total cost" value={money.short(m.totalCostUsd)} />
                <Kpi label="Client profit (all time)" value={money.short(m.clientProfit)} />
            </div>
            <div className="grid g-8-4 mt">
                <Figure title="Revenue against cost" sub="Revenue received from clients, month by month.">
                    {loadFailed(months) ? <LoadError error={months.error} retry={() => months.refetch()} what="the months" />
                        : !months.data ? <SkeletonLines lines={5} /> : (
                            <Columns height={200} labelEvery={1} seriesLabel="Revenue" ghostLabel="Cost" format={(v) => money.short(v)}
                                data={months.data.map((x) => ({ label: MONTHS[+x.month.slice(5, 7) - 1], tip: fmtMonthY(x.month), value: x.revenue, ghost: x.cost }))} />
                        )}
                </Figure>
                <Figure title="Cost composition" sub="In the selected range.">
                    <CompositionBar height={18} parts={[
                        { label: "Labour", value: m.labour.usd, color: "var(--heat-3)" },
                        { label: "Project expenses", value: m.expensesUsd, color: "var(--heat-1)" },
                    ]} />
                </Figure>
            </div>
            <div className="grid g-2 mt">
                <Figure title="Profit by project" sub="Client work, all time.">
                    <ProfitBars onClick={(it) => open(`projects/${it.id}`)?.()}
                        items={[...m.profitByProject].sort((a, b) => b.profit - a.profit).map((p) => ({
                            id: p.projectId, label: p.title, value: p.profit, note: `${money.pct(p.revenue ? p.profit / p.revenue : null)} margin`,
                        }))} />
                </Figure>
                <Figure title="Labour cost by employee" sub="Within the selected range.">
                    <RankBars format={(v) => money.short(v)} unit="Cost" onClick={(it) => open(`people/${it.id}`)?.()}
                        items={m.labourByPerson.filter((p) => p.labourCost.usd > 0).sort((a, b) => b.labourCost.usd - a.labourCost.usd).slice(0, 10).map((p) => ({
                            id: p.userId, label: p.name, value: p.labourCost.usd,
                            node: <><Avatar person={personOf(people, p.userId, p.name)} size={20} /><span className="trunc">{p.name}</span></>,
                        }))} />
                </Figure>
            </div>
            {m.labour.unconverted.length > 0 && <p className="hint mt"><MixedCurrency amounts={m.labour.unconverted} /> - paid in another currency and shown separately.</p>}
        </div>
    );
}

export function EntriesTab({ scope, label, people }: { scope: ReportScope; label: string; people: Map<number, ReportPerson> }) {
    const permissions = usePermissions();
    const [q, setQ] = useState("");
    const search = useDebounce({ value: q, debounceTimeMs: 250 }).trim();
    const query = useReportEntries({ ...scope, search: search || undefined }, permissions.has(P.WORK_ENTRY_VIEW_ALL));
    const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
    const total = query.data?.pages[0]?.totalCount ?? 0;
    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Work entries</div>
                    <div className="panel-sub">{query.data ? `${fmtNumber(total)} entries in ${label} · exact start and end times as recorded.` : " "}</div>
                </div>
                <div className="panel-tools">
                    <SearchInput width={220} value={q} onChange={setQ} placeholder="Search work, person or project" />
                </div>
            </div>
            {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the entries" /></div>
                : !query.data ? <div className="panel-body"><SkeletonLines lines={8} /></div> : (
                    <div className="tbl-wrap">
                        <table className="tbl tbl-min">
                            <thead><tr><th>Date</th><th>Time</th><th className="r">Duration</th><th className="r">Overtime</th><th>Employee</th><th>Project</th><th>Work</th></tr></thead>
                            <tbody>
                                {rows.map((e) => (
                                    <tr key={e.id}>
                                        <td className="nowrap muted">{fmtDate(e.startedAt)}</td>
                                        <td className="mono nowrap">{fmtRange(e.startedAt, e.endedAt)}</td>
                                        <td className="r mono nowrap">{fmtDur(e.minutes)}</td>
                                        <td className={cx("r mono nowrap", e.overtimeMinutes ? "ot-text" : "muted")}>{e.overtimeMinutes ? fmtDur(e.overtimeMinutes) : "-"}</td>
                                        <td className="nowrap"><PersonLine person={personOf(people, e.person.id, e.person.name)} size={22} sub={false} link /></td>
                                        <td className="nowrap">
                                            <div className="pname"><ProjectTile icon={e.project.icon} tint={e.project.tint} size="sm" /><span className="trunc" style={{ maxWidth: 140 }}>{e.project.title}</span></div>
                                        </td>
                                        <td><span className="trunc" style={{ display: "block", maxWidth: 320 }}>{e.description}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            {query.data && rows.length === 0 && <Empty art="search" title={search ? "No entries match" : "No work logged in this period"} />}
            {query.hasNextPage && (
                <div className="panel-foot">
                    <button className="btn btn-sm btn-quiet" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                        {query.isFetchingNextPage ? "Loading…" : "Show 50 more"}
                    </button>
                    <div className="grow" />
                    <span className="muted">Showing {rows.length} of {fmtNumber(total)}</span>
                </div>
            )}
        </div>
    );
}
