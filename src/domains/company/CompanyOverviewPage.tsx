import { useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { domainHome } from "@/app/routing/home";
import Board, { BoardButton } from "@/shared/components/Board/Board";
import { Kpi } from "@/shared/components/Data/Kpi";
import { CostRow, MixedCurrency, Money } from "@/shared/components/Data/Money";
import Tabs from "@/shared/components/Data/Tabs";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import { companyToday, daysBetween, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import TeamsSettings from "../shared/settings/TeamsSettings";
import { useCompanyOverview, type CompanyOverview } from "./companyApi";
import { companyPeriod, lastChoice, rememberChoice, type PeriodChoice } from "./companyPeriod";
import PeriodBar from "./PeriodBar";
import CompanyPeople from "./people/CompanyPeople";
import { loadFailed } from "@/api/queryState";

/** One amount per currency (costs come per source: materials, labour, expenses). */
const merged = (amounts: { currency: string; amount: number }[]) =>
    [...amounts.reduce((m, a) => m.set(a.currency, (m.get(a.currency) ?? 0) + a.amount), new Map<string, number>())].map(([currency, amount]) => ({ currency, amount }));

type DomainFigures = CompanyOverview["domains"][number];
type Tab = "overview" | "people" | "teams";

function Line({ label, value, strong, rule, tone }: { label: string; value: number; strong?: boolean; rule?: boolean; tone?: "auto" }) {
    return (
        <div className={cx("co-line", strong && "strong", rule && "rule")}>
            <span>{label}</span>
            <b className="mono"><Money value={value} tone={tone ?? ""} /></b>
        </div>
    );
}

/**
 * Both businesses and what the company keeps, over one window (the prototype's P.CompanyOverview). Each
 * business earns its own profit; the company's expenses belong to neither, so they come out once, here.
 * Its People and Teams tabs are the API's: the prototype had a fixed staff and fixed teams.
 */
export default function CompanyOverviewPage() {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const tabs: { key: Tab; label: string }[] = [
        { key: "overview", label: "Overview" },
        ...(permissions.has(P.EMPLOYEE_VIEW) ? [{ key: "people" as const, label: "People" }] : []),
        { key: "teams", label: "Teams" },
    ];
    const requested = params.get("tab");
    const tab = tabs.find((t) => t.key === requested)?.key ?? "overview";
    const open = (next: Tab) => {
        if (next === "overview") params.delete("tab");
        else params.set("tab", next);
        setParams(params, { replace: true });
    };

    return (
        <div className="page">
            {tab === "overview" ? <Figures tabs={<Tabs value={tab} onChange={open} items={tabs} />} /> : (
                <>
                    <div className="page-head">
                        <div>
                            <h1 className="page-title">Company overview</h1>
                            <div className="page-sub">{tab === "people" ? "Everyone in Design, Execution and above them" : "The teams of both businesses"}</div>
                        </div>
                    </div>
                    <Tabs value={tab} onChange={open} items={tabs} />
                    {tab === "people" ? <CompanyPeople /> : (
                        <div className="grid g-2">
                            <TeamsSettings domain="design" named />
                            <TeamsSettings domain="execution" named />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** The overview tab: the period, the company's result and each business's figures. */
function Figures({ tabs }: { tabs: ReactNode }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const [choice, setChoice] = useState<PeriodChoice>(lastChoice);
    const [editing, setEditing] = useState(false);
    const today = companyToday();
    const period = companyPeriod(choice, today);
    const overview = useCompanyOverview({ from: period.from, to: period.to });
    const t = overview.data;
    const days = Math.max(1, daysBetween(period.from, period.to) + 1);
    const choose = (next: PeriodChoice) => { rememberChoice(next); setChoice(next); };
    const label = (d: string) => AREAS[d as Domain]?.label ?? d;

    const keeps = (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">What the company keeps</div>
                    <div className="panel-sub">{period.label}. Each business earns its own profit. Company expenses belong to neither, so they come out once, here.</div>
                </div>
            </div>
            <div className="panel-body">
                {!t ? <SkeletonLines lines={5} /> : (
                    <div className="co-sheet">
                        {t.domains.map((d) => <Line key={d.domain} label={`${label(d.domain)} profit`} value={d.profit} tone="auto" />)}
                        <Line label="Combined" value={t.grossProfit} rule />
                        <Line label="Company expenses" value={-t.overhead} />
                        <Line label="Company net profit" value={t.netProfit} strong tone="auto" />
                    </div>
                )}
                {t && t.unconvertedOverhead.length > 0 && <div className="mt-s"><MixedCurrency amounts={t.unconvertedOverhead.map((u) => ({ currency: u.currency, amount: u.total }))} /></div>}
                <p className="hint mt">
                    Revenue is the money received from clients in this window, on the day it arrived; costs are the labour, expenses, materials and site labour dated inside it.
                    Company expenses are the monthly pool of subscriptions and running costs, counted day by day for the {days} day{days === 1 ? "" : "s"} shown
                    - never charged to a project or a client.
                </p>
            </div>
        </div>
    );
    const across = (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Across both</div><div className="panel-sub">{period.label}</div></div></div>
            <div className="panel-body">
                {!t ? <SkeletonLines lines={6} /> : (
                    <>
                        <CostRow label="Revenue" value={money.fmt(t.revenue)} />
                        <CostRow label="Cost" value={money.fmt(t.cost)} />
                        {/* amounts in a currency with no rate on their day are left out of the totals, and said here */}
                        {t.domains.some((d) => d.unconvertedCosts.length > 0) && <div className="mt-s"><MixedCurrency amounts={merged(t.domains.flatMap((d) => d.unconvertedCosts))} /></div>}
                        <CostRow label="Invoiced" value={money.fmt(t.invoiced)} />
                        {t.unconvertedInvoices.length > 0 && <div className="mt-s"><MixedCurrency amounts={t.unconvertedInvoices} /></div>}
                        <CostRow label="Collected" value={money.fmt(t.collected)} />
                        <CostRow label="Outstanding today" value={money.fmt(t.outstanding)} />
                        <CostRow label="Projects with activity" value={fmtNumber(t.projectsWithActivity)} />
                        <CostRow label="Clients served" value={fmtNumber(t.clientsServed)} />
                    </>
                )}
            </div>
        </div>
    );
    const business = (d: DomainFigures) => {
        const area = AREAS[d.domain as Domain];
        return (
            <div className="panel">
                <div className="panel-head">
                    <div>
                        <div className="panel-title row" style={{ gap: 8 }}><span className="launch-ic sm"><Icon name={area.icon} /></span>{area.label}</div>
                        <div className="panel-sub">{area.tagline} · {period.label}</div>
                    </div>
                    {permissions.canSeeDomain(d.domain as Domain) && (
                        <div className="panel-tools"><button className="btn btn-sm" onClick={() => navigate(domainHome(permissions, d.domain as Domain))}>Manage</button></div>
                    )}
                </div>
                <div className="panel-body">
                    <div className="kpis">
                        <Kpi label="Revenue" value={money.short(d.revenue)} />
                        <Kpi label="Cost" value={money.short(d.cost)} />
                        <Kpi label="Profit" value={money.short(d.profit)} sub={d.margin != null ? `${money.pct(d.margin)} margin` : "-"} />
                    </div>
                    {d.unconvertedCosts.length > 0 && <div className="mt-s"><MixedCurrency amounts={merged(d.unconvertedCosts)} /></div>}
                    <div className="kpis" style={{ marginTop: 10 }}>
                        <Kpi label="Projects" value={fmtNumber(d.projectsWithActivity)} sub={`with activity · ${d.activeProjects} active now`} />
                        <Kpi label="People" value={fmtNumber(d.people)} sub={d.tracksHours ? `${d.loggers} logged work` : "hours not tracked"} />
                        <Kpi label="Clients" value={fmtNumber(d.clientsServed)} sub={`served · ${d.allClients} in total`} />
                    </div>
                    <div className="kpis" style={{ marginTop: 10 }}>
                        <Kpi label="Invoiced" value={money.short(d.invoiced)} />
                        <Kpi label="Collected" value={money.short(d.collected)} />
                        <Kpi label="Outstanding" value={money.short(d.outstanding)} sub="today" />
                    </div>
                    {d.unconvertedInvoices.length > 0 && <div className="mt-s"><MixedCurrency amounts={d.unconvertedInvoices} /></div>}
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="page-head">
                <div>
                    <h1 className="page-title">Company overview</h1>
                    <div className="page-sub">Design and Execution together · {period.label}</div>
                </div>
                <div className="page-actions">
                    <BoardButton editing={editing} onToggle={() => setEditing((e) => !e)} />
                    <button className="btn" onClick={() => navigate("/company")}><Icon name="grid" />All areas</button>
                </div>
            </div>

            {tabs}
            <PeriodBar choice={choice} period={period} onChange={choose} />

            <div className="mt">
                {loadFailed(overview) ? <div className="panel"><div className="panel-body"><LoadError error={overview.error} retry={() => overview.refetch()} what="the company's figures" /></div></div> : (
                    <Board id="company-overview" editing={editing} onDone={() => setEditing(false)} cards={[
                        { key: "keeps", label: "What the company keeps", span: 8, node: keeps },
                        { key: "across", label: "Across both", span: 4, node: across },
                        ...(t?.domains ?? []).map((d) => ({ key: d.domain, label: label(d.domain), span: 6, node: business(d) })),
                    ]} />
                )}
            </div>
        </>
    );
}
