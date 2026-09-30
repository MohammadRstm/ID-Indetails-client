import { useState } from "react";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import Tabs from "@/shared/components/Data/Tabs";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { ChipGroup, Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { addDays, companyToday, fmtDate, fmtDur, fmtH, fmtMonthY, fmtNumber } from "@/shared/format/time";
import { quarterEnd, quarterLabel, quarterOf, quarterStart, type PeriodKind } from "@/shared/format/periods";
import Icon from "@/shared/icons/Icon";
import { useProjects } from "../../shared/projects/projectsApi";
import { usePeopleWork } from "../people/peopleWorkApi";
import { EntriesTab, MoneyTab, OverviewTab, PeopleTab, ProjectsTab, type ReportPerson, type Tile } from "./ReportTabs";
import { useWorkReport, type ReportScope } from "./reportsApi";

type Tab = "overview" | "projects" | "people" | "money" | "entries";

/** The days a report covers, as the prototype's Reports page picks them. */
function rangeOf(period: PeriodKind, year: number, quarter: number, today: string): { from: string; to: string; label: string } {
    if (period === "month") return { from: `${today.slice(0, 7)}-01`, to: today, label: fmtMonthY(today) };
    if (period === "30d") return { from: addDays(today, -29), to: today, label: "Last 30 days" };
    const from = period === "year" ? `${year}-01-01` : quarterStart(year, quarter);
    const end = period === "year" ? `${year}-12-31` : quarterEnd(year, quarter);
    // a period still running stops today; one that hasn't started covers its first day
    const to = end > today ? (from > today ? from : today) : end;
    return { from, to, label: period === "year" ? String(year) : quarterLabel(year, quarter) };
}

/** Company-wide analysis of logged work, and its money (the prototype's P.AdminReports). */
export default function ReportsPage() {
    const permissions = usePermissions();
    const today = companyToday();
    const now = quarterOf(today);
    const [tab, setTab] = useState<Tab>("overview");
    const [period, setPeriod] = useState<PeriodKind>("quarter");
    const [quarter, setQuarter] = useState(String(now.quarter));
    const [year, setYear] = useState(String(now.year));
    const [projectId, setProjectId] = useState("all");
    const [personId, setPersonId] = useState("all");
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);

    const range = rangeOf(period, +year, +quarter, today);
    const scope: ReportScope = {
        from: range.from, to: range.to,
        projectId: projectId === "all" ? undefined : +projectId,
        userId: personId === "all" ? undefined : +personId,
    };
    const query = useWorkReport(scope);
    const projects = useProjects({ domain: "design", pageSize: 100 }).data?.items ?? [];
    const peopleWork = usePeopleWork(seesWork).data ?? [];
    const tiles = new Map<number, Tile>(projects.map((p) => [p.id, { icon: p.icon, tint: p.tint }]));
    const people = new Map<number, ReportPerson>(peopleWork.map((r) => [r.id, { id: r.id, name: r.name, photoFileId: r.photoFileId, team: r.teamName }]));
    const r = query.data;

    const project = projects.find((p) => String(p.id) === projectId);
    const person = peopleWork.find((p) => String(p.id) === personId);
    const sub = ["Company-wide analysis", range.label, project?.title, person?.name].filter(Boolean).join(" · ");
    const shownTab: Tab = (tab === "money" && !seesMoney) || (tab === "entries" && !seesWork) ? "overview" : tab;

    async function exportCsv() {
        try {
            await downloadFile("/work-entries/export", `report-${range.from}-to-${range.to}.csv`, { ...scope });
        } catch (e) {
            toast({ text: "The report wasn't exported", sub: errorMessage(e), icon: "alert" });
        }
    }

    return (
        <div className="page">
            <PageHead title="Reports" sub={sub}
                actions={seesWork && <button className="btn" onClick={exportCsv}><Icon name="download" />Export</button>} />

            <div className="filters">
                <Segmented value={period} onChange={setPeriod} aria-label="Period" options={[
                    { value: "quarter", label: "Quarter" }, { value: "month", label: "This month" }, { value: "30d", label: "Last 30 days" }, { value: "year", label: "Year" },
                ]} />
                {period === "quarter" && (
                    <ChipGroup value={quarter} onChange={setQuarter} aria-label="Quarter" options={["1", "2", "3", "4"].map((q) => ({ value: q, label: `Q${q}` }))} />
                )}
                {(period === "quarter" || period === "year") && (
                    <Select className="select sm" style={{ width: 92 }} aria-label="Year" value={year} onChange={setYear}
                        options={[now.year, now.year - 1].map((y) => ({ value: String(y), label: String(y) }))} />
                )}
                <div className="grow" />
                <Select className="select sm" style={{ width: 190 }} aria-label="Project" value={projectId} onChange={setProjectId}
                    options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.title }))]} />
                {seesWork && (
                    <Select className="select sm" style={{ width: 175 }} aria-label="Employee" value={personId} onChange={setPersonId}
                        options={[{ value: "all", label: "All employees" }, ...peopleWork.map((p) => ({ value: String(p.id), label: p.name }))]} />
                )}
            </div>

            {query.isError ? <div className="panel"><div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the report" /></div></div> : (
                <>
                    <KpiStrip loading={!r} items={[
                        { key: "hours", label: "Hours logged", value: fmtNumber(Math.round((r?.totalMinutes ?? 0) / 60)), unit: "h" },
                        { key: "entries", label: "Work entries", value: fmtNumber(r?.entryCount ?? 0) },
                        { key: "projects", label: "Projects with activity", value: r?.projectCount ?? 0 },
                        { key: "people", label: "People logging", value: r?.peopleCount ?? 0 },
                        { key: "avg", label: "Average entry", value: r?.entryCount ? fmtDur(r.averageEntryMinutes) : "-" },
                        {
                            key: "busiest", label: "Busiest week", value: r?.busiestWeek?.minutes ? fmtH(r.busiestWeek.minutes) : "-",
                            sub: <span>{r?.busiestWeek?.minutes ? `week of ${fmtDate(r.busiestWeek.weekStart)}` : "no work in range"}</span>,
                        },
                    ]} />

                    <Tabs value={shownTab} onChange={setTab} items={[
                        { key: "overview" as const, label: "Overview" },
                        { key: "projects" as const, label: "By project", count: r?.byProject.length ?? null },
                        { key: "people" as const, label: "By employee", count: r?.byPerson.length ?? null },
                        ...(seesMoney ? [{ key: "money" as const, label: "Money" }] : []),
                        ...(seesWork ? [{ key: "entries" as const, label: "Work entries", count: r?.entryCount ?? null }] : []),
                    ]} />

                    {shownTab === "entries" ? <EntriesTab scope={scope} label={range.label} people={people} />
                        : !r ? <div className="panel"><div className="panel-body"><SkeletonLines lines={8} /></div></div>
                            : shownTab === "projects" ? <ProjectsTab report={r} label={range.label} tiles={tiles} people={people} />
                                : shownTab === "people" ? <PeopleTab report={r} label={range.label} tiles={tiles} people={people} />
                                    : shownTab === "money" ? <MoneyTab report={r} label={range.label} tiles={tiles} people={people} />
                                        : <OverviewTab report={r} label={range.label} tiles={tiles} people={people} />}
                </>
            )}
        </div>
    );
}
