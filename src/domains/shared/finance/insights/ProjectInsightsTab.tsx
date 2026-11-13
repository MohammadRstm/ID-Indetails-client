import { loadFailed } from "@/api/queryState";
import HelpHint from "@/domains/shared/help/HelpHint";
import { ProfitBars } from "@/shared/components/Charts/Bars";
import { Bar } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import { CostRow, MixedCurrency } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import { fmtH } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { PlannedHoursCell } from "../../../design/projects/departments/PlannedHours";
import type { Project } from "../../projects/projectsApi";
import { BasisNote, StandingBadge } from "./InsightParts";
import WhatIfPanel from "./WhatIfPanel";
import { BRIDGE_STEPS, percentText, useProjectInsight, type DepartmentInsight, type ProjectInsight } from "./insightsApi";

/**
 * A project's Insights tab, for whoever sees the money: what was agreed against everything it cost and where that
 * stands against the profit floor, where the profit comes from, a Design project's departments, and a what-if form.
 * Every figure is the API's; nothing here is added up.
 */
export default function ProjectInsightsTab({ project }: { project: Project }) {
    const insight = useProjectInsight(project.id);
    if (loadFailed(insight)) {
        return <div className="panel"><div className="panel-body"><LoadError error={insight.error} retry={() => insight.refetch()} what="the project's insights" /></div></div>;
    }
    if (!insight.data) return <><SkeletonKpis count={5} /><div className="panel mt"><div className="panel-body"><SkeletonLines lines={6} /></div></div></>;
    const x = insight.data;
    return (
        <>
            <Profitability insight={x} />
            {x.departments && x.departments.length > 0 && <Departments departments={x.departments} />}
            <WhatIfPanel insight={x} />
        </>
    );
}

/** The headline figures, then the bridge from the price first agreed to the agreed profit, then how it was worked out. */
function Profitability({ insight: x }: { insight: ProjectInsight }) {
    const site = x.domain === "execution";
    const client = x.billingType === "client";
    const done = x.status === "completed" || x.status === "archived";
    return (
        <div className="panel" role="region" aria-label="Profitability">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Profitability</div>
                    <div className="panel-sub">All time, in USD before TVA: what was agreed against everything the project has cost so far.</div>
                </div>
            </div>
            <div className="panel-body">
                <div className="kpis">
                    {client ? (
                        <>
                            <Kpi label="Agreed revenue" value={money.exact(x.agreedRevenue)}
                                sub={x.tvaRate > 0 ? `before TVA · ${money.short(x.agreedWithTva)} with it` : "before TVA"} />
                            <Kpi label={<>Agreed profit<HelpHint article="project-insights" label="agreed profit">The agreed revenue minus everything the project has cost so far, plus any pocket money it was paid.</HelpHint></>}
                                value={<span className={x.agreedProfit < 0 ? "down" : "up"}>{money.exact(x.agreedProfit)}</span>}
                                sub={!done && x.projected ? `projected ${money.short(x.projected.profit)} at completion` : `${x.progressPct}% done`} />
                            <Kpi label="Margin" value={x.marginKnown && x.margin != null ? money.pct(x.margin) : <span className="muted">Too early</span>}
                                sub={x.marginKnown ? "profit ÷ agreed revenue" : "needs 5% progress or 10 logged hours"} />
                            <Kpi label={<>Profit floor<HelpHint article="project-insights" label="the profit floor">A change that would take the profit to zero or below is refused, unless someone who sees the money forces it through.</HelpHint></>}
                                value={<StandingBadge standing={x.standing} />} sub={x.standing ? undefined : "applies once a price is agreed"} />
                            <Kpi label="Client still owes" value={money.exact(x.owed)} sub={`TVA included · ${money.short(x.received)} received`} />
                        </>
                    ) : <Kpi label="Cost so far" value={money.exact(x.cost.total)} sub="internal work: no revenue, so no margin" />}
                    {site && client && x.siteCashProfit != null && (
                        <Kpi label="Profit so far" value={<span className={x.siteCashProfit < 0 ? "down" : "up"}>{money.exact(x.siteCashProfit)}</span>}
                            sub={x.toPocket || x.fromPocket ? "received − spent ± pocket money" : "received − spent"} />
                    )}
                    {site && x.executedProgress != null && (
                        <Kpi label={<>Executed (by value)<HelpHint article="boq-progress" label="progress by value">The value of the work executed on the agreed BOQ and VOs, by the quantities the site recorded, against their agreed value.</HelpHint></>}
                            value={money.pct(x.executedProgress)} sub="work executed ÷ agreed work" />
                    )}
                </div>

                <div className="u mt" style={{ marginBottom: 6 }}>{client ? "Where the profit comes from" : "Where the cost comes from"}</div>
                <ProfitBars unit="On the profit" items={x.bridge.map((s, i) => {
                    const step = BRIDGE_STEPS[s.kind];
                    return { id: i, label: step.label, value: s.amount, note: (site && step.siteNote) || step.note };
                })} />
                <CostRow strong label={client ? "Agreed profit" : "Net result"} value={money.exact(x.agreedProfit)} tone={x.agreedProfit < 0 ? "down" : ""} />
                {x.cost.unconverted.length > 0 && <div className="mt-s"><MixedCurrency amounts={x.cost.unconverted} /></div>}
            </div>
            <div className="panel-foot">
                <BasisNote basis={x.basis} label="How this is worked out" />
            </div>
        </div>
    );
}

/**
 * A Design project's departments: each one's share of the price, its budget, what its hours cost, and its part of the
 * labour; and its hours against those planned, once any department has a plan.
 */
function Departments({ departments }: { departments: DepartmentInsight[] }) {
    const planned = departments.some((d) => d.plannedMinutes != null);
    return (
        <div className="panel mt" role="region" aria-label="Departments">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Departments</div>
                    <div className="panel-sub">Each department's share of the price before TVA, what the hours logged in it cost, and its part of the project's labour.</div>
                </div>
            </div>
            <div className="tbl-wrap">
                <table className="tbl tbl-min-sm" aria-label="Department profitability">
                    <thead>
                        <tr>
                            <th>Department</th>
                            <th className="r">Share</th>
                            <th className="r">Budget</th>
                            <th className="r">Hours</th>
                            {planned && <th style={{ width: 150 }}>Planned hours</th>}
                            <th className="r">Cost</th>
                            <th className="r">Left</th>
                            <th style={{ width: 140 }}>Share of labour</th>
                        </tr>
                    </thead>
                    <tbody>
                        {departments.map((d) => <DepartmentRow key={d.id ?? "other"} department={d} planned={planned} />)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function DepartmentRow({ department: d, planned }: { department: DepartmentInsight; planned: boolean }) {
    const budgeted = d.share != null;
    const over = budgeted && d.left < 0;
    return (
        <tr className={cx(over && "dept-over")} aria-label={d.name}>
            <td>
                <div className="dept-name">{d.name}</div>
                {!budgeted && <div className="muted" style={{ fontSize: 11.5 }}>In no budget</div>}
            </td>
            <td className="r mono">{d.share != null ? percentText(d.share * 100) : "-"}</td>
            <td className="r mono">{budgeted ? money.fmt(d.budget) : "-"}</td>
            <td className="r mono">{fmtH(d.minutes)}</td>
            {planned && <td><PlannedHoursCell department={{ plannedMinutes: d.plannedMinutes, loggedMinutes: d.minutes, progress: d.progress }} /></td>}
            <td className={cx("r mono", over && "money down")}>
                {money.fmt(d.cost)}
                {d.unconverted.length > 0 && <div><MixedCurrency amounts={d.unconverted} /></div>}
            </td>
            <td className={cx("r mono", over && "money down")}>{budgeted ? money.fmt(d.left) : "-"}</td>
            <td>{d.labourShare != null ? <Bar value={d.labourShare * 100} /> : <span className="muted">-</span>}</td>
        </tr>
    );
}
