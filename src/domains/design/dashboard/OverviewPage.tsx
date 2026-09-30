import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import type { Domain } from "@/app/permissions/permissions";
import { useDomain } from "@/app/routing/domainContext";
import { useCurrentUser } from "@/app/session/useSession";
import { useCompanySettings } from "@/app/shell/shellQueries";
import Board, { BoardButton } from "@/shared/components/Board/Board";
import { Delta } from "@/shared/components/Charts/Bars";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { Segmented } from "@/shared/components/Forms/Filters";
import { PersonAvatar } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { periodRange, quarterLabel, quarterOf, type PeriodKind } from "@/shared/format/periods";
import { companyToday, DAYS_LONG, fmtDayDateY, fmtH, fmtNumber, isoWeek, partsOf } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useClientOverview } from "../../shared/clients/clientsApi";
import { costPartsOf, costWords } from "../../shared/finance/costParts";
import { useFinanceAttention, useFinanceBilling, useFinanceClients, useFinanceMonthly, useFinanceProjects, useFinanceSummary } from "../../shared/finance/financeApi";
import { useProjects } from "../../shared/projects/projectsApi";
import { activityLevelOf } from "@/shared/components/Data/activity";
import { usePeopleWork } from "../people/peopleWorkApi";
import { followups } from "./followups";
import { FollowupsCard, HoursCard, InvoicedCard, OwedCard, ProfitCard, RevenueCostCard, StatusCard, TimeCard, TopClientsCard, type ProjectInfo } from "./OverviewCards";
import { useDashboard, useOverview, useUpcomingDeadlines } from "./overviewApi";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";

type Period = Extract<PeriodKind, "quarter" | "month" | "30d">;

/** A card that couldn't load, keeping its place on the board. */
function Failed({ query, what }: { query: { error: unknown; refetch: () => unknown }; what: string }) {
    return <div className="panel"><div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what={what} /></div></div>;
}
const orFailed = (query: { isError: boolean; data: unknown; error: unknown; refetch: () => unknown }, what: string, node: ReactNode) =>
    loadFailed(query) ? <Failed query={query} what={what} /> : node;

/** The overview an admin lands on: Design's, or Execution's dashboard. */
export default function OverviewRoute() {
    const domain = useDomain();
    return <OverviewPage key={domain} domain={domain} />;
}

/**
 * This period's work and money on a board each person arranges (the prototype's P.AdminOverview). Execution
 * logs no hours, so its dashboard is the same board without the cards about work.
 */
function OverviewPage({ domain }: { domain: Domain }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const me = useCurrentUser();
    const company = useCompanySettings().data;
    const [period, setPeriod] = useState<Period>("quarter");
    const [editing, setEditing] = useState(false);
    const design = domain === "design";
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    const seesWork = design && permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const seesClients = permissions.has(P.CLIENT_VIEW);
    const today = companyToday();
    const range = periodRange(period, today);
    const months = period === "30d" ? 8 : 6;

    const overview = useOverview(period === "30d" ? "last30" : period, design);
    const dashboard = useDashboard(domain);
    const deadlines = useUpcomingDeadlines(domain, design);
    const clientOverview = useClientOverview(domain, seesClients);
    const peopleWork = usePeopleWork(seesWork);
    const projectList = useProjects({ domain, pageSize: 100 });
    const summary = useFinanceSummary(domain, { from: range.from, to: range.to }, seesMoney);
    const monthly = useFinanceMonthly(domain, months, seesMoney);
    const finProjects = useFinanceProjects(domain, seesMoney);
    const billing = useFinanceBilling(domain, months, seesMoney);
    const moneyAttention = useFinanceAttention(domain, seesMoney && design);
    const finClients = useFinanceClients(domain, seesMoney);

    const o = overview.data;
    const d = dashboard.data;
    const s = summary.data;
    const projects = new Map<number, ProjectInfo>((projectList.data?.items ?? []).map((p) => [p.id, {
        icon: p.icon, tint: p.tint, activity: activityLevelOf(p.work?.activityLevel), targetDate: p.targetDate,
    }]));
    const online = (peopleWork.data ?? []).filter((r) => r.online && r.status === "active");
    const count = (status: string) => (o ?? d)?.projectsByStatus.find((x) => x.status === status)?.count ?? 0;
    const hour = partsOf(new Date()).hour;
    const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const q = quarterOf(today);
    const items = o ? followups(o.attention, seesMoney ? moneyAttention.data : [], today, (id) => projects.get(id)?.targetDate) : [];
    const weekStart = DAYS_LONG[company?.weekStart ?? 1];

    const figures = (
        <KpiStrip loading={(design && !o) || !d} items={[
            { key: "active", label: "Active projects", value: count("active"), sub: <span>{count("hold")} on hold · {count("completed")} completed</span> },
            {
                key: "clients", label: "Clients", value: d?.clients ?? 0,
                sub: clientOverview.data ? <span className="link" {...clickable(() => navigate(`/${domain}/clients`), "link")}>{clientOverview.data.withActiveWork} with active work</span> : undefined,
            },
            ...(!design ? [] : [{
                key: "hours", label: `Hours logged · ${range.label}`, value: fmtNumber(Math.round((o?.minutes ?? 0) / 60)), unit: "h",
                sub: o?.overtimeMinutes ? <span className="ot-text">{fmtH(o.overtimeMinutes)} overtime</span> : undefined,
                delta: o && <Delta value={o.minutes} prev={o.previousMinutes} label={`vs ${range.prevLabel}`} />,
            },
            { key: "entries", label: "Work entries", value: fmtNumber(o?.entries ?? 0), delta: o && <Delta value={o.entries} prev={o.previousEntries} label={`vs ${range.prevLabel}`} /> },
            { key: "logging", label: "Logging this week", value: `${o?.peopleLoggingThisWeek ?? 0} of ${o?.people ?? 0}`, sub: <span>{fmtH(o?.thisWeekMinutes ?? 0)} logged since {weekStart}</span> }]),
            ...(seesWork ? [{
                key: "online", label: "Online now", value: online.length,
                sub: <div className="av-stack">{online.slice(0, 6).map((r) => <PersonAvatar key={r.id} person={{ id: r.id, name: r.name, photoFileId: r.photoFileId }} size={18} />)}</div>,
            }] : []),
        ]} />
    );

    const moneyFigures = orFailed(summary, "the money", (
        <KpiStrip loading={!s} items={[
            { key: "revenue", label: `Revenue · ${range.label}`, value: money.short(s?.revenue ?? 0), sub: <span>recognised by progress</span> },
            {
                key: "cost", label: "Total cost", value: money.short(s?.cost.total ?? 0),
                // "labour $12k · project expenses $1.6k"; a site's "materials $6k · ground labour $3k · project expenses $0"
                sub: <span>{costPartsOf(domain).map((p) => `${p.key === "labour" ? "labour" : p.label.toLowerCase()} ${money.short(s?.cost[p.key] ?? 0)}`).join(" · ")}</span>,
            },
            { key: "profit", label: "Net profit", value: money.short(s?.profit ?? 0), sub: <span>revenue less {costWords(domain).toLowerCase()}</span> },
            { key: "margin", label: "Margin", value: money.pct(s?.margin), sub: <span>in this period</span> },
            {
                key: "outstanding", label: "Outstanding", value: money.short(s?.billing.outstanding ?? 0),
                sub: <span className={s?.billing.overdue ? "down" : ""}>of {money.short(s?.billing.invoiced ?? 0)} invoiced{s?.billing.overdue ? ` · ${money.short(s.billing.overdue)} overdue` : ""}</span>,
            },
        ]} />
    ));

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Good {greeting}, {me.firstName || me.email}</h1>
                    <div className="page-sub">{fmtDayDateY(today)} · {quarterLabel(q.year, q.quarter)} · week {isoWeek(today)}</div>
                </div>
                <div className="page-actions">
                    <Segmented value={period} onChange={setPeriod} aria-label="Period" options={[
                        { value: "quarter", label: "This quarter" }, { value: "month", label: "This month" }, { value: "30d", label: "Last 30 days" },
                    ]} />
                    <BoardButton editing={editing} onToggle={() => setEditing((e) => !e)} />
                    {permissions.has(P.PROJECT_CREATE) && (
                        <button className="btn btn-primary" onClick={() => navigate(`/${domain}/projects?new=1`)}><Icon name="plus" />New project</button>
                    )}
                </div>
            </div>

            {loadFailed(overview) && <div style={{ marginBottom: 14 }}><Failed query={overview} what="the overview" /></div>}
            {/* Execution's board, and Design's project counts, come from the dashboard */}
            {loadFailed(dashboard) && <div style={{ marginBottom: 14 }}><Failed query={dashboard} what="the dashboard" /></div>}

            <Board id={`overview-${domain}`} editing={editing} onDone={() => setEditing(false)} cards={[
                { key: "figures", label: "Key figures", span: 12, node: figures },
                seesMoney && { key: "money", label: "Money figures", span: 12, node: moneyFigures },
                design && { key: "hours", label: "Hours logged per week", span: 7, node: <HoursCard overview={o} label={range.label} prevLabel={range.prevLabel} /> },
                design && { key: "followups", label: "Needs attention & deadlines", span: 5, node: <FollowupsCard items={items} deadlines={deadlines.data} loading={!o}
                    deadlinesFailed={loadFailed(deadlines) ? { error: deadlines.error, retry: () => void deadlines.refetch() } : null} /> },
                design && { key: "time", label: "Where the time went", span: 7, node: <TimeCard overview={o} label={range.label} projects={projects} /> },
                { key: "status", label: "Projects by status", span: design ? 5 : 12, node: <StatusCard overview={o} dashboard={d} execution={!design} /> },
                seesMoney && { key: "revcost", label: "Revenue against cost", span: 7, node: <RevenueCostCard months={monthly.data} error={loadFailed(monthly) ? monthly.error : null} retry={() => monthly.refetch()} /> },
                seesMoney && { key: "profit", label: "Profit by project", span: 5, node: orFailed(finProjects, "the projects' profit", <ProfitCard finance={finProjects.data} projects={projects} />) },
                seesMoney && { key: "invoiced", label: "Invoiced against collected", span: 7, node: orFailed(billing, "the billing", <InvoicedCard billing={billing.data} />) },
                seesMoney && { key: "owed", label: "Money owed to us", span: 5, node: orFailed(billing, "what is owed", <OwedCard billing={billing.data} />) },
                seesMoney && { key: "clients", label: "Top clients", span: 12, node: orFailed(finClients, "the clients", <TopClientsCard clients={finClients.data} />) },
            ]} />
        </div>
    );
}
