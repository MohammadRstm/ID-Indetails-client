import { useState } from "react";
import { useSearchParams } from "react-router";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import ComingSoon from "@/app/pages/ComingSoon";
import { useDomain } from "@/app/routing/domainContext";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import Tabs from "@/shared/components/Data/Tabs";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { Segmented } from "@/shared/components/Forms/Filters";
import { money } from "@/shared/format/money";
import { quarterLabel, quarterOf, quarterStart } from "@/shared/format/periods";
import { companyToday, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useFinanceClients, useFinanceCosts, useFinanceMonthly, useFinanceProjects, useFinanceSummary } from "../../shared/finance/financeApi";
import { useProjects } from "../../shared/projects/projectsApi";
import { ClientsTab, CostsTab, OverviewTab, ProjectsTab, type Tile } from "./FinanceTabs";

type PeriodKey = "quarter" | "year" | "all";
type Tab = "overview" | "projects" | "clients" | "costs";
const TABS: Tab[] = ["overview", "projects", "clients", "costs"];

/** "All time" asks from a day before any project; the API's own default is this quarter. */
const ALL_TIME = "2000-01-01";

function periodsOf(today: string): Record<PeriodKey, { label: string; from: string; to: string; months: number }> {
    const { year, quarter } = quarterOf(today);
    return {
        quarter: { label: quarterLabel(year, quarter), from: quarterStart(year, quarter), to: today, months: 3 },
        year: { label: String(year), from: `${year}-01-01`, to: today, months: +today.slice(5, 7) },
        all: { label: "All time", from: ALL_TIME, to: today, months: 13 },
    };
}

/** A business's financials; Execution's arrive with phase 6. */
export default function FinancialsRoute() {
    return useDomain() === "design" ? <FinancialsPage /> : <ComingSoon title="Financials" />;
}

/** Revenue, cost and profit across Design's projects (the prototype's P.AdminFinancials). */
function FinancialsPage() {
    const [params, setParams] = useSearchParams();
    const requested = params.get("tab") as Tab | null;
    const tab: Tab = requested && TABS.includes(requested) ? requested : "overview";
    const setTab = (t: Tab) => { params.set("tab", t); setParams(params, { replace: true }); };
    const [periodKey, setPeriodKey] = useState<PeriodKey>("year");
    const periods = periodsOf(companyToday());
    const period = periods[periodKey];
    const range = { from: period.from, to: period.to };

    const summary = useFinanceSummary("design", range, true);
    const monthly = useFinanceMonthly("design", Math.max(4, Math.min(13, period.months)), tab === "overview");
    const projects = useFinanceProjects("design", true);
    const clients = useFinanceClients("design", true);
    const costs = useFinanceCosts("design", range, tab === "costs");
    const tiles = new Map<number, Tile>((useProjects({ domain: "design", pageSize: 100 }).data?.items ?? []).map((p) => [p.id, { icon: p.icon, tint: p.tint }]));
    const s = summary.data;

    async function exportCsv() {
        const slug = period.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        try {
            await downloadFile("/finance/design/projects/export", `financials-${slug}.csv`, range);
        } catch (e) {
            toast({ text: "The financials weren't exported", sub: errorMessage(e), icon: "alert" });
        }
    }

    return (
        <div className="page">
            <PageHead title="Financials" sub={`Revenue, cost and profit across every project · ${period.label}`}
                actions={
                    <>
                        <Segmented value={periodKey} onChange={setPeriodKey} aria-label="Period"
                            options={(Object.keys(periods) as PeriodKey[]).map((k) => ({ value: k, label: periods[k].label }))} />
                        <button className="btn" onClick={exportCsv}><Icon name="download" />Export</button>
                    </>
                } />

            {summary.isError ? <div className="panel"><div className="panel-body"><LoadError error={summary.error} retry={() => summary.refetch()} what="the financials" /></div></div> : (
                <>
                    <KpiStrip loading={!s} items={[
                        { key: "revenue", label: "Revenue recognised", value: money.short(s?.revenue ?? 0), sub: <span>{s?.clientProjects ?? 0} client projects · by progress</span> },
                        { key: "labour", label: "Employee labour", value: money.short(s?.cost.labour ?? 0), sub: <span>{fmtNumber(Math.round((s?.labourMinutes ?? 0) / 60))} hours logged</span> },
                        { key: "expenses", label: "Project expenses", value: money.short(s?.cost.expenses ?? 0) },
                        { key: "profit", label: "Net profit", value: money.short(s?.profit ?? 0), sub: <span>revenue less labour and expenses</span> },
                        { key: "margin", label: "Margin", value: money.pct(s?.margin), sub: <span>all-time client profit {money.short(s?.allTimeClientProfit ?? 0)}</span> },
                    ]} />

                    <Tabs value={tab} onChange={setTab} items={[
                        { key: "overview", label: "Overview" },
                        { key: "projects", label: "Projects", count: projects.data?.projects.length ?? null },
                        { key: "clients", label: "Clients", count: clients.data?.length ?? null },
                        { key: "costs", label: "Costs" },
                    ]} />

                    {tab === "overview" && (s ? <OverviewTab summary={s} months={monthly.data} projects={projects.data} label={period.label} tiles={tiles} />
                        : <div className="panel"><div className="panel-body"><SkeletonLines lines={8} /></div></div>)}
                    {tab === "projects" && <ProjectsTab projects={projects.data} tiles={tiles} />}
                    {tab === "clients" && <ClientsTab clients={clients.data} projects={projects.data} />}
                    {tab === "costs" && <CostsTab costs={costs.data} error={costs.isError ? costs.error : null} retry={() => costs.refetch()} tiles={tiles} />}
                </>
            )}
        </div>
    );
}
