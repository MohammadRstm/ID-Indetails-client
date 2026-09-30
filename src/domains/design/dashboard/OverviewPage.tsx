import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import ComingSoon from "@/app/pages/ComingSoon";
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
import { useFinanceAttention, useFinanceBilling, useFinanceClients, useFinanceMonthly, useFinanceProjects, useFinanceSummary } from "../../shared/finance/financeApi";
import { useProjects } from "../../shared/projects/projectsApi";
import { activityLevelOf } from "@/shared/components/Data/activity";
import { usePeopleWork } from "../people/peopleWorkApi";
import { followups } from "./followups";
import { FollowupsCard, HoursCard, InvoicedCard, OwedCard, ProfitCard, RevenueCostCard, StatusCard, TimeCard, TopClientsCard, type ProjectInfo } from "./OverviewCards";
import { useDashboard, useOverview, useUpcomingDeadlines } from "./overviewApi";

type Period = Extract<PeriodKind, "quarter" | "month" | "30d">;

/** A card that couldn't load, keeping its place on the board. */
function Failed({ query, what }: { query: { error: unknown; refetch: () => unknown }; what: string }) {
    return <div className="panel"><div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what={what} /></div></div>;
}
const orFailed = (query: { isError: boolean; error: unknown; refetch: () => unknown }, what: string, node: ReactNode) =>
    query.isError ? <Failed query={query} what={what} /> : node;

/** The overview a Design admin lands on; Execution's dashboard arrives with phase 6. */
export default function OverviewRoute() {
    return useDomain() === "design" ? <OverviewPage /> : <ComingSoon title="Dashboard" />;
}

/** Design's overview: this period's work and money on a board each person arranges (the prototype's P.AdminOverview). */
function OverviewPage() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const me = useCurrentUser();
    const company = useCompanySettings().data;
    const [period, setPeriod] = useState<Period>("quarter");
    const [editing, setEditing] = useState(false);
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const seesClients = permissions.has(P.CLIENT_VIEW);
    const today = companyToday();
    const range = periodRange(period, today);
    const months = period === "30d" ? 8 : 6;

    const overview = useOverview(period === "30d" ? "last30" : period);
    const dashboard = useDashboard("design");
    const deadlines = useUpcomingDeadlines("design");
    const clientOverview = useClientOverview("design", seesClients);
    const peopleWork = usePeopleWork(seesWork);
    const projectList = useProjects({ domain: "design", pageSize: 100 });
    const summary = useFinanceSummary("design", { from: range.from, to: range.to }, seesMoney);
    const monthly = useFinanceMonthly("design", months, seesMoney);
    const finProjects = useFinanceProjects("design", seesMoney);
    const billing = useFinanceBilling("design", months, seesMoney);
    const moneyAttention = useFinanceAttention("design", seesMoney);
    const finClients = useFinanceClients("design", seesMoney);

    const o = overview.data;
    const d = dashboard.data;
    const s = summary.data;
    const projects = new Map<number, ProjectInfo>((projectList.data?.items ?? []).map((p) => [p.id, {
        icon: p.icon, tint: p.tint, activity: activityLevelOf(p.work?.activityLevel), targetDate: p.targetDate,
    }]));
    const online = (peopleWork.data ?? []).filter((r) => r.online && r.status === "active");
    const count = (status: string) => o?.projectsByStatus.find((x) => x.status === status)?.count ?? 0;
    const hour = partsOf(new Date()).hour;
    const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    const q = quarterOf(today);
    const items = o ? followups(o.attention, seesMoney ? moneyAttention.data : [], today, (id) => projects.get(id)?.targetDate) : [];
    const weekStart = DAYS_LONG[company?.weekStart ?? 1];

    const figures = (
        <KpiStrip loading={!o || !d} items={[
            { key: "active", label: "Active projects", value: count("active"), sub: <span>{count("hold")} on hold · {count("completed")} completed</span> },
            {
                key: "clients", label: "Clients", value: d?.clients ?? 0,
                sub: clientOverview.data ? <span className="link" onClick={() => navigate("/design/clients")}>{clientOverview.data.withActiveWork} with active work</span> : undefined,
            },
            {
                key: "hours", label: `Hours logged · ${range.label}`, value: fmtNumber(Math.round((o?.minutes ?? 0) / 60)), unit: "h",
                sub: o?.overtimeMinutes ? <span className="ot-text">{fmtH(o.overtimeMinutes)} overtime</span> : undefined,
                delta: o && <Delta value={o.minutes} prev={o.previousMinutes} label={`vs ${range.prevLabel}`} />,
            },
            { key: "entries", label: "Work entries", value: fmtNumber(o?.entries ?? 0), delta: o && <Delta value={o.entries} prev={o.previousEntries} label={`vs ${range.prevLabel}`} /> },
            { key: "logging", label: "Logging this week", value: `${o?.peopleLoggingThisWeek ?? 0} of ${o?.people ?? 0}`, sub: <span>{fmtH(o?.thisWeekMinutes ?? 0)} logged since {weekStart}</span> },
            ...(seesWork ? [{
                key: "online", label: "Online now", value: online.length,
                sub: <div className="av-stack">{online.slice(0, 6).map((r) => <PersonAvatar key={r.id} person={{ id: r.id, name: r.name, photoFileId: r.photoFileId }} size={18} />)}</div>,
            }] : []),
        ]} />
    );

    const moneyFigures = orFailed(summary, "the money", (
        <KpiStrip loading={!s} items={[
            { key: "revenue", label: `Revenue · ${range.label}`, value: money.short(s?.revenue ?? 0), sub: <span>recognised by progress</span> },
            { key: "cost", label: "Total cost", value: money.short(s?.cost.total ?? 0), sub: <span>labour {money.short(s?.cost.labour ?? 0)} · project expenses {money.short(s?.cost.expenses ?? 0)}</span> },
            { key: "profit", label: "Net profit", value: money.short(s?.profit ?? 0), sub: <span>revenue less labour and expenses</span> },
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
                        <button className="btn btn-primary" onClick={() => navigate("/design/projects?new=1")}><Icon name="plus" />New project</button>
                    )}
                </div>
            </div>

            {overview.isError && <div style={{ marginBottom: 14 }}><Failed query={overview} what="the overview" /></div>}

            <Board id="overview-design" editing={editing} onDone={() => setEditing(false)} cards={[
                { key: "figures", label: "Key figures", span: 12, node: figures },
                seesMoney && { key: "money", label: "Money figures", span: 12, node: moneyFigures },
                { key: "hours", label: "Hours logged per week", span: 7, node: <HoursCard overview={o} label={range.label} prevLabel={range.prevLabel} /> },
                { key: "followups", label: "Needs attention & deadlines", span: 5, node: <FollowupsCard items={items} deadlines={deadlines.data} loading={!o} /> },
                { key: "time", label: "Where the time went", span: 7, node: <TimeCard overview={o} label={range.label} projects={projects} /> },
                { key: "status", label: "Projects by status", span: 5, node: <StatusCard overview={o} dashboard={d} /> },
                seesMoney && { key: "revcost", label: "Revenue against cost", span: 7, node: <RevenueCostCard months={monthly.data} error={monthly.isError ? monthly.error : null} retry={() => monthly.refetch()} /> },
                seesMoney && { key: "profit", label: "Profit by project", span: 5, node: orFailed(finProjects, "the projects' profit", <ProfitCard finance={finProjects.data} projects={projects} />) },
                seesMoney && { key: "invoiced", label: "Invoiced against collected", span: 7, node: orFailed(billing, "the billing", <InvoicedCard billing={billing.data} />) },
                seesMoney && { key: "owed", label: "Money owed to us", span: 5, node: orFailed(billing, "what is owed", <OwedCard billing={billing.data} />) },
                seesMoney && { key: "clients", label: "Top clients", span: 12, node: orFailed(finClients, "the clients", <TopClientsCard clients={finClients.data} />) },
            ]} />
        </div>
    );
}
