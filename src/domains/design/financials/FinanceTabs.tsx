import { useState } from "react";
import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import { CompositionBar, ProfitBars, RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import LineChart from "@/shared/components/Charts/LineChart";
import Waterfall from "@/shared/components/Charts/Waterfall";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { CostRow } from "@/shared/components/Data/Money";
import { MarginPill, StatusBadge } from "@/shared/components/Data/Pills";
import { SortTh, type SortState } from "@/shared/components/Data-Tables/DataTable";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtH, fmtMonthY, MONTHS } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { ClientBadge } from "../../shared/clients/ClientBits";
import type { FinanceClient, FinanceMonth, FinanceProjects, FinanceSummary } from "../../shared/finance/financeApi";

export type Tile = { icon: string | null; tint: string | null };
type FinanceProject = Schemas["FinanceProjectResponse"];

const COL = { labour: "var(--heat-3)", expense: "var(--heat-1)" };
const monthLabel = (m: string) => MONTHS[+m.slice(5, 7) - 1];

/** Opens a Design page when the viewer may; otherwise leaves the row still. */
function useOpener() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    return (path: string) => (canOpen(permissions, "design", path) ? () => navigate(`/design/${path}`) : undefined);
}

const Tile = ({ tile }: { tile: Tile | undefined }) => <ProjectTile icon={tile?.icon} tint={tile?.tint} size="sm" />;

type OverviewTabProps = {
    summary: FinanceSummary;
    months: FinanceMonth[] | undefined;
    projects: FinanceProjects | undefined;
    label: string;
    tiles: Map<number, Tile>;
};

export function OverviewTab({ summary: s, months, projects, label, tiles }: OverviewTabProps) {
    const open = useOpener();
    const list = months ?? [];
    const all = projects?.projects ?? [];
    const billable = all.filter((f) => f.billingType !== "internal");
    const internal = all.filter((f) => f.billingType === "internal");
    return (
        <div>
            <div className="grid g-8-4">
                <Figure title="Revenue against cost, month by month" sub="Revenue is recognised by progress - a project earns its payment as the work is done."
                    table={{ cols: [{ label: "Month" }, { label: "Revenue", right: true }, { label: "Cost", right: true }, { label: "Profit", right: true }], rows: list.map((m) => [fmtMonthY(m.month), money.fmt(m.revenue), money.fmt(m.cost), money.fmt(m.profit)]) }}>
                    {!months ? <SkeletonLines lines={8} /> : (
                        <>
                            <Columns height={210} labelEvery={Math.max(1, Math.ceil(list.length / 7))} seriesLabel="Revenue recognised" ghostLabel="Total cost" format={(v) => money.short(v)}
                                data={list.map((m) => ({ label: monthLabel(m.month), tip: fmtMonthY(m.month), value: m.revenue, ghost: m.cost, note: `profit ${money.fmt(m.profit)}` }))} />
                            <div className="mt">
                                <div className="u" style={{ marginBottom: 2 }}>Profit per month</div>
                                <LineChart height={120} tickEvery={Math.max(1, Math.ceil(list.length / 6))} format={(v) => money.short(v)}
                                    series={[{ label: "Profit", area: true, points: list.map((m) => ({ y: m.profit, label: monthLabel(m.month), tip: fmtMonthY(m.month) })) }]} />
                            </div>
                        </>
                    )}
                </Figure>
                <Figure title="Net profit" sub={`Everything earned and spent in ${label} - internal work included.`}>
                    <Waterfall height={200} steps={[
                        { label: "Revenue", value: s.revenue, kind: "start" },
                        { label: "Labour", value: s.cost.labour, kind: "cost" },
                        { label: "Expenses", value: s.cost.expenses, kind: "cost" },
                        { label: "Net profit", value: 0, kind: "result" },
                    ]} />
                    <div className="chart-note">
                        Labour and expenses include internal work.
                        {s.stillToEarn > 1000 && <span> Running projects have {money.short(s.stillToEarn)} of contracted payment still to earn.</span>}
                    </div>
                </Figure>
            </div>

            <div className="grid g-7-5 mt">
                <Figure title="Profit by client project" sub="Losses point left."
                    table={{ cols: [{ label: "Project" }, { label: "Profit", right: true }, { label: "Margin", right: true }], rows: billable.map((f) => [f.title, money.fmt(f.profit), money.pct(f.margin)]) }}>
                    {!projects ? <SkeletonLines lines={6} /> : (
                        <ProfitBars onClick={(it) => open(`projects/${it.id}`)?.()}
                            items={[...billable].sort((a, b) => b.profit - a.profit).map((f) => ({
                                id: f.projectId, label: f.title, value: f.profit, note: `${money.pct(f.margin)} margin`,
                                node: <><Tile tile={tiles.get(f.projectId)} /><span className="trunc">{f.title}</span></>,
                            }))} />
                    )}
                </Figure>
                <Figure title="Internal investment" sub="Projects with no payment attached - pure company cost.">
                    {!projects ? <SkeletonLines lines={4} /> : (
                        <>
                            <RankBars format={(v) => money.short(v)} unit="Cost" onClick={(it) => open(`projects/${it.id}`)?.()}
                                items={[...internal].sort((a, b) => b.cost.total - a.cost.total).map((f) => ({
                                    id: f.projectId, label: f.title, value: f.cost.total,
                                    node: <><Tile tile={tiles.get(f.projectId)} /><span className="trunc">{f.title}</span></>,
                                }))} />
                            <div className="chart-note">{money.fmt(s.allTimeInternalCost)} invested in internal work, all time - it never shows a margin, but it is real cost.</div>
                        </>
                    )}
                </Figure>
            </div>

            <div className="panel mt">
                <div className="panel-head"><div><div className="panel-title">Cost composition</div><div className="panel-sub">Every dollar the company spent, by kind.</div></div></div>
                <div className="panel-body">
                    <CompositionBar height={18} parts={[
                        { label: "Employee labour", value: s.cost.labour, color: COL.labour },
                        { label: "Project expenses", value: s.cost.expenses, color: COL.expense },
                    ]} />
                </div>
            </div>
        </div>
    );
}

type ProjectSort = "name" | "revenue" | "hours" | "cost" | "profit" | "margin";

export function ProjectsTab({ projects, tiles }: { projects: FinanceProjects | undefined; tiles: Map<number, Tile> }) {
    const open = useOpener();
    const [sort, setSort] = useState<SortState>({ key: "profit", dir: "desc" });
    const all = projects?.projects ?? [];
    const dir = sort.dir === "desc" ? 1 : -1;
    const by: Record<ProjectSort, (f: FinanceProject) => number> = {
        name: () => 0, revenue: (f) => f.revenue, hours: (f) => f.hours, cost: (f) => f.cost.total, profit: (f) => f.profit,
        margin: (f) => (f.marginKnown && f.margin != null ? f.margin : -9),
    };
    const key = sort.key as ProjectSort;
    const sorted = [...all].sort((a, b) => (key === "name" ? a.title.localeCompare(b.title) * -dir : (by[key](b) - by[key](a)) * dir));
    const internalCount = all.filter((f) => f.billingType === "internal").length;
    return (
        <div className="panel">
            <div className="panel-head">
                <div><div className="panel-title">Profitability by project</div><div className="panel-sub">Client projects show margin; internal projects show what they cost.</div></div>
            </div>
            {!projects ? <div className="panel-body"><SkeletonLines lines={8} /></div> : (
                <div className="tbl-wrap">
                    <table className="tbl tbl-min">
                        <thead>
                            <tr>
                                <SortTh sortKey="name" sort={sort} onSort={setSort}>Project</SortTh>
                                <th>Status</th>
                                <SortTh sortKey="revenue" sort={sort} onSort={setSort} right>Revenue</SortTh>
                                <SortTh sortKey="hours" sort={sort} onSort={setSort} right>Hours</SortTh>
                                <th className="r">Labour</th>
                                <th className="r">Expenses</th>
                                <SortTh sortKey="cost" sort={sort} onSort={setSort} right>Cost</SortTh>
                                <SortTh sortKey="profit" sort={sort} onSort={setSort} right>Profit</SortTh>
                                <SortTh sortKey="margin" sort={sort} onSort={setSort}>Margin</SortTh>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((f) => {
                                const internal = f.billingType === "internal";
                                const go = open(`projects/${f.projectId}`);
                                return (
                                    <tr key={f.projectId} className={cx(go && "click")} onClick={go}>
                                        <td>
                                            <div className="pname">
                                                <Tile tile={tiles.get(f.projectId)} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="trunc" style={{ fontWeight: 600 }}>{f.title}</div>
                                                    <div className="muted" style={{ fontSize: 11 }}>{internal ? "Internal" : "Client project"}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><StatusBadge status={f.status} /></td>
                                        <td className="r mono">{internal ? <span className="muted">-</span> : money.fmt(f.revenue)}</td>
                                        <td className="r mono">{fmtH(f.hours * 60)}</td>
                                        <td className="r mono">{money.fmt(f.cost.labour)}</td>
                                        <td className="r mono">{money.fmt(f.cost.expenses)}</td>
                                        <td className="r mono">{money.fmt(f.cost.total)}</td>
                                        <td className={cx("r mono", !internal && (f.profit >= 0 ? "up" : "down"))}>
                                            {internal ? <span className="muted">{money.fmt(-f.cost.total)}</span> : money.fmt(f.profit)}
                                        </td>
                                        <td><MarginPill value={f.marginKnown ? f.margin : null} internal={internal} label={false} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="panel-foot">
                <span>{all.length - internalCount} client · {internalCount} internal</span>
                <div className="grow" />
                <span className="muted">Margin needs 5% progress or 10 logged hours before it is shown.</span>
            </div>
        </div>
    );
}

const HEAT = ["var(--heat-4)", "var(--heat-3)", "var(--heat-2)", "var(--heat-1)"];

export function ClientsTab({ clients, projects }: { clients: FinanceClient[] | undefined; projects: FinanceProjects | undefined }) {
    const open = useOpener();
    const all = clients ?? [];
    const rows = all.filter((c) => c.money.projects > 0).sort((a, b) => b.money.revenue - a.money.revenue);
    const total = rows.reduce((t, c) => t + c.money.revenue, 0);
    const top = rows[0];
    const concentration = top && total ? top.money.revenue / total : 0;
    const t = projects?.totals;
    const allClients = open("clients");
    if (!clients) return <div className="panel"><div className="panel-body"><SkeletonLines lines={8} /></div></div>;
    return (
        <div>
            <div className="grid g-7-5">
                <Figure title="Revenue and profit by client" sub="Every figure is the sum of that client's projects - no separate rules."
                    table={{ cols: [{ label: "Client" }, { label: "Revenue", right: true }, { label: "Profit", right: true }, { label: "Margin", right: true }], rows: rows.map((c) => [c.name, money.fmt(c.money.revenue), money.fmt(c.money.profit), money.pct(c.money.margin)]) }}>
                    <RankBars format={(v) => money.short(v)} unit="Revenue" showPct onClick={(it) => open(`clients/${it.id}`)?.()}
                        items={rows.map((c) => ({ id: c.clientId, label: c.name, value: c.money.revenue }))} />
                    <div className="mt">
                        <div className="u" style={{ marginBottom: 4 }}>Profit by client</div>
                        <ProfitBars onClick={(it) => open(`clients/${it.id}`)?.()}
                            items={[...rows].sort((a, b) => b.money.profit - a.money.profit).map((c) => ({ id: c.clientId, label: c.name, value: c.money.profit, note: `${money.pct(c.money.margin)} margin` }))} />
                    </div>
                </Figure>

                <div className="stack">
                    <Figure title="Client concentration" sub="How much of the book sits with one client.">
                        <CompositionBar height={18} parts={rows.slice(0, 4).map((c, i) => ({ label: c.name, value: c.money.revenue, color: HEAT[i] }))} />
                        <div className="chart-note">
                            {top ? `${top.name} is ${money.pct(concentration)} of contracted revenue.` : "No client revenue yet."}
                            {concentration > 0.4 ? " Losing that account would take most of the book with it." : ""}
                        </div>
                    </Figure>
                    <div className="panel">
                        <div className="panel-head"><div><div className="panel-title">Client work against internal work</div></div></div>
                        <div className="panel-body">
                            {!t ? <SkeletonLines lines={3} /> : (
                                <>
                                    <CostRow label="Cost of client projects" swatch="var(--heat-3)" meta={`${t.clientProjects} projects`} value={money.fmt(t.clientCost)} />
                                    <CostRow label="Cost of internal projects" swatch="var(--ghost)" meta={`${t.internalProjects} projects`} value={money.fmt(t.internalCost)} />
                                    <CostRow strong label="Profit from clients" value={money.fmt(t.clientProfit)} />
                                    <p className="hint mt-s">Internal work has no client and never appears in a client total.</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="panel mt">
                <div className="panel-head">
                    <div><div className="panel-title">Client ledger</div><div className="panel-sub">Revenue, cost and profit aggregated from each client's projects.</div></div>
                </div>
                <div className="tbl-wrap">
                    <table className="tbl tbl-min">
                        <thead>
                            <tr><th>Client</th><th>Label</th><th className="r">Projects</th><th className="r">Hours</th><th className="r">Revenue</th>
                                <th className="r">Labour</th><th className="r">Expenses</th><th className="r">Profit</th><th>Margin</th></tr>
                        </thead>
                        <tbody>
                            {rows.map((c) => {
                                const go = open(`clients/${c.clientId}`);
                                return (
                                    <tr key={c.clientId} className={cx(go && "click")} onClick={go}>
                                        <td><ClientBadge client={{ id: c.clientId, displayName: c.name }} link={false} /></td>
                                        <td>{c.label && <span className="badge">{c.label}</span>}</td>
                                        <td className="r num">{c.money.projects}</td>
                                        <td className="r mono">{fmtH(c.money.hours * 60)}</td>
                                        <td className="r mono">{money.fmt(c.money.revenue)}</td>
                                        <td className="r mono">{money.fmt(c.money.cost.labour)}</td>
                                        <td className="r mono">{money.fmt(c.money.cost.expenses)}</td>
                                        <td className={cx("r mono", c.money.profit >= 0 ? "up" : "down")}>{money.fmt(c.money.profit)}</td>
                                        <td><MarginPill value={c.money.marginKnown ? c.money.margin : null} label={false} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="panel-foot">
                    <span>{rows.length} clients with projects · {all.length - rows.length} without</span>
                    <div className="grow" />
                    {allClients && <button className="btn btn-sm btn-quiet" onClick={allClients}>Open Clients</button>}
                </div>
            </div>
        </div>
    );
}

type Costs = Schemas["FinanceCostsResponse"];

export function CostsTab({ costs, error, retry, tiles }: { costs: Costs | undefined; error: unknown; retry: () => void; tiles: Map<number, Tile> }) {
    const open = useOpener();
    if (error) return <div className="panel"><div className="panel-body"><LoadError error={error} retry={retry} what="the costs" /></div></div>;
    if (!costs) return <div className="panel"><div className="panel-body"><SkeletonLines lines={8} /></div></div>;
    return (
        <div>
            <div className="grid g-2">
                <Figure title="Labour cost by employee" sub="Hours already logged, costed at each person's rate."
                    table={{ cols: [{ label: "Employee" }, { label: "Hours", right: true }, { label: "Cost", right: true }], rows: costs.labourByPerson.map((p) => [p.name, fmtH(p.minutes), money.fmt(p.usd)]) }}>
                    <RankBars format={(v) => money.short(v)} unit="Cost" onClick={(it) => open(`people/${it.id}`)?.()}
                        items={costs.labourByPerson.filter((p) => p.usd > 0).map((p) => ({
                            id: p.userId, label: p.name, value: p.usd,
                            node: <><Avatar person={{ name: p.name }} size={20} /><span className="trunc">{p.name}</span></>,
                        }))} />
                </Figure>
                <Figure title="Project expenses by category" sub="One-off costs that belong to a single project.">
                    <RankBars format={(v) => money.short(v)} showPct
                        items={costs.expensesByCategory.map((c) => ({ label: c.category.charAt(0).toUpperCase() + c.category.slice(1), value: c.usd }))} />
                </Figure>
            </div>

            <div className="panel mt">
                <div className="panel-head"><div><div className="panel-title">Biggest single expenses</div><div className="panel-sub">Across every project.</div></div></div>
                <div className="tbl-wrap">
                    <table className="tbl tbl-min-sm">
                        <thead><tr><th>Expense</th><th>Project</th><th>Category</th><th>Date</th><th className="r">Amount</th></tr></thead>
                        <tbody>
                            {costs.biggestExpenses.map((x) => {
                                const go = open(`projects/${x.projectId}`);
                                return (
                                    <tr key={x.id} className={cx(go && "click")} onClick={go}>
                                        <td><b>{x.label}</b></td>
                                        <td><div className="pname"><Tile tile={tiles.get(x.projectId)} /><span className="trunc">{x.projectTitle}</span></div></td>
                                        <td className="muted">{x.category}</td>
                                        <td className="muted nowrap">{fmtDateY(x.spentOn)}</td>
                                        <td className="r mono">{money.fmt(x.amount, x.currency)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
