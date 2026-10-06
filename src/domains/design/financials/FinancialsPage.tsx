import { useState } from "react";
import { useSearchParams } from "react-router";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
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
import BillingModalHost from "../../shared/billing/BillingModalHost";
import BillingTab from "../../shared/billing/BillingTab";
import { useInvoices } from "../../shared/billing/billingApi";
import { costPartsOf, costWords } from "../../shared/finance/costParts";
import { useFinanceClients, useFinanceCosts, useFinanceMonthly, useFinanceProjects, useFinanceSummary } from "../../shared/finance/financeApi";
import { useProjects } from "../../shared/projects/projectsApi";
import { ClientsTab, CostsTab, OverviewTab, ProjectsTab, type Failure, type Tile } from "./FinanceTabs";
import HelpHint from "@/domains/shared/help/HelpHint";

type PeriodKey = "quarter" | "year" | "all";
type Tab = "overview" | "projects" | "clients" | "billing" | "costs";
const TABS: Tab[] = ["overview", "projects", "clients", "billing", "costs"];

/** "All time" asks from a day before any project; the API's own default is this quarter. */
const ALL_TIME = "2000-01-01";

// a load that failed with nothing to show; a failed refresh keeps the figures it had
const failureOf = (q: { isError: boolean; data?: unknown; error: unknown; refetch: () => unknown }): Failure =>
    q.isError && !q.data ? { error: q.error, retry: () => void q.refetch() } : null;

function periodsOf(today: string): Record<PeriodKey, { label: string; from: string; to: string; months: number }> {
    const { year, quarter } = quarterOf(today);
    return {
        quarter: { label: quarterLabel(year, quarter), from: quarterStart(year, quarter), to: today, months: 3 },
        year: { label: String(year), from: `${year}-01-01`, to: today, months: +today.slice(5, 7) },
        all: { label: "All time", from: ALL_TIME, to: today, months: 13 },
    };
}

/** Revenue, cost and profit across a domain's projects (the prototype's P.AdminFinancials), for Design and Execution alike. */
export default function FinancialsRoute() {
    const domain = useDomain();
    return <FinancialsPage key={domain} domain={domain} />;
}

function FinancialsPage({ domain }: { domain: Domain }) {
    const [params, setParams] = useSearchParams();
    const requested = params.get("tab") as Tab | null;
    const tab: Tab = requested && TABS.includes(requested) ? requested : "overview";
    const setTab = (t: Tab) => { params.set("tab", t); setParams(params, { replace: true }); };
    const [periodKey, setPeriodKey] = useState<PeriodKey>("year");
    const periods = periodsOf(companyToday());
    const period = periods[periodKey];
    const range = { from: period.from, to: period.to };

    const summary = useFinanceSummary(domain, range, true);
    const monthly = useFinanceMonthly(domain, Math.max(4, Math.min(13, period.months)), tab === "overview");
    const projects = useFinanceProjects(domain, true);
    const clients = useFinanceClients(domain, true);
    const costs = useFinanceCosts(domain, range, tab === "costs");
    const invoiceCount = useInvoices({ domain, pageSize: 1 }).data?.totalCount;
    const tiles = new Map<number, Tile>((useProjects({ domain, pageSize: 100 }, usePermissions().has(P.PROJECT_VIEW)).data?.items ?? []).map((p) => [p.id, { icon: p.icon, tint: p.tint }]));
    const s = summary.data;
    // Design spends on its employees' hours and expenses; a site on materials, ground labour and expenses
    const costTiles = domain === "design"
        ? [
            { key: "labour", label: "Employee labour", value: money.short(s?.cost.labour ?? 0), sub: <span>{fmtNumber(Math.round((s?.labourMinutes ?? 0) / 60))} hours logged</span> },
            { key: "expenses", label: "Project expenses", value: money.short(s?.cost.expenses ?? 0) },
        ]
        : costPartsOf(domain).map((part) => ({ key: part.key, label: part.label, value: money.short(s?.cost[part.key] ?? 0) }));

    async function exportCsv() {
        const slug = period.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        try {
            await downloadFile(`/finance/${domain}/projects/export`, `financials-${slug}.csv`, range);
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

            {summary.isError && !summary.data ? <div className="panel"><div className="panel-body"><LoadError error={summary.error} retry={() => summary.refetch()} what="the financials" /></div></div> : (
                <>
                    <KpiStrip loading={!s} items={[
                        {
                            key: "revenue", value: money.short(s?.revenue ?? 0), sub: <span>{s?.clientProjects ?? 0} client projects · payments in the period</span>,
                            label: <>Revenue received<HelpHint article="revenue" label="revenue received">The money clients paid in the period, counted on the day it arrived. A project's own revenue is what was agreed.</HelpHint></>,
                        },
                        ...costTiles,
                        { key: "profit", label: "Net profit", value: money.short(s?.profit ?? 0), sub: <span>revenue less {costWords(domain).toLowerCase()}</span> },
                        {
                            key: "margin", value: money.pct(s?.margin), sub: <span>all-time client profit {money.short(s?.allTimeClientProfit ?? 0)}</span>,
                            label: <>Margin<HelpHint article="profit-margin" label="margin">Net profit as a share of the revenue received in the period.</HelpHint></>,
                        },
                    ]} />

                    <Tabs value={tab} onChange={setTab} items={[
                        { key: "overview", label: "Overview" },
                        { key: "projects", label: "Projects", count: projects.data?.projects.length ?? null },
                        { key: "clients", label: "Clients", count: clients.data?.length ?? null },
                        { key: "billing", label: "Billing", count: invoiceCount ?? null },
                        { key: "costs", label: "Costs" },
                    ]} />

                    {tab === "overview" && (s ? <OverviewTab summary={s} months={monthly.data} projects={projects.data} label={period.label} tiles={tiles}
                        failed={{ months: failureOf(monthly), projects: failureOf(projects) }} />
                        : <div className="panel"><div className="panel-body"><SkeletonLines lines={8} /></div></div>)}
                    {tab === "projects" && <ProjectsTab projects={projects.data} failed={failureOf(projects)} tiles={tiles} />}
                    {tab === "clients" && <ClientsTab clients={clients.data} projects={projects.data} failed={{ clients: failureOf(clients), projects: failureOf(projects) }} />}
                    {tab === "billing" && <BillingTab domain={domain} tiles={tiles} />}
                    {tab === "costs" && <CostsTab costs={costs.data} error={costs.isError && !costs.data ? costs.error : null} retry={() => costs.refetch()} tiles={tiles} />}
                </>
            )}
            <BillingModalHost />
        </div>
    );
}
