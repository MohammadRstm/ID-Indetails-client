import { useState } from "react";
import { loadFailed } from "@/api/queryState";
import type { Domain } from "@/app/permissions/permissions";
import HelpHint from "@/domains/shared/help/HelpHint";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import { MixedCurrency, Money } from "@/shared/components/Data/Money";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Segmented } from "@/shared/components/Forms/Filters";
import { money } from "@/shared/format/money";
import { fmtH, fmtMonthY, MONTHS } from "@/shared/format/time";
import { BasisNote, ProjectLink } from "./InsightParts";
import { TREND_MONTHS, useDomainLabour, type LabourInsight, type TrendMonths } from "./domainInsightsApi";

type Tile = { icon: string | null; tint: string | null };

const monthLabel = (m: string) => MONTHS[+m.slice(5, 7) - 1];
/** Hours, or a dash for none. */
const hoursOr = (minutes: number) => (minutes ? fmtH(minutes) : "-");

/**
 * Design's labour on the Insights tab: what the logged hours cost, month by month, by department and by project, and
 * how much of it was asked for beyond the agreed scope. Every figure and share is the API's, and none is about one
 * person.
 */
export default function LabourPanel({ domain, tiles }: { domain: Domain; tiles?: Map<number, Tile> }) {
    const [months, setMonths] = useState<TrendMonths>(12);
    const labour = useDomainLabour(domain, months);
    const failed = loadFailed(labour);
    const l = labour.data;
    const worked = (l?.total.minutes ?? 0) > 0;
    return (
        <div className="mt" role="region" aria-label="Labour">
            <Figure title={<>Labour<HelpHint article="labour-insights" label="labour">What the hours logged on Design projects cost, at each person's rate on the day, paid breaks included. Hours logged outside the agreed scope are shown apart. No figure here is about one person.</HelpHint></>}
                sub={`What the hours logged on Design projects cost over the last ${months} months, in USD at the rate of each day. This month runs to today.`}
                tools={<Segmented aria-label="Months of labour shown" value={String(months)} onChange={(v) => setMonths(Number(v) as TrendMonths)}
                    options={TREND_MONTHS.map((n) => ({ value: String(n), label: `${n} months` }))} />}
                table={l && worked ? {
                    cols: [{ label: "Month" }, { label: "Cost", right: true }, { label: "Hours", right: true }, { label: "Outside the scope", right: true }, { label: "Outside-scope hours", right: true }],
                    rows: l.months.map((m) => [fmtMonthY(m.month), money.fmt(m.totals.cost), hoursOr(m.totals.minutes), money.fmt(m.totals.outsideScopeCost), hoursOr(m.totals.outsideScopeMinutes)]),
                } : undefined}>
                {failed ? <LoadError error={labour.error} retry={() => labour.refetch()} what="the labour" />
                    : !l ? <SkeletonLines lines={8} />
                        : !worked ? <Empty art="time" title="No labour in these months" text={`No hours were logged on Design projects in the last ${months} months.`} />
                            : <LabourChart labour={l} months={months} />}
                {l && l.unconverted.length > 0 && (
                    <div className="chart-note">With no exchange rate on its day, this labour is in none of these costs: <MixedCurrency amounts={l.unconverted} /></div>
                )}
            </Figure>
            {l && worked && !failed && (
                <>
                    <Departments labour={l} />
                    <Projects labour={l} domain={domain} tiles={tiles} />
                </>
            )}
        </div>
    );
}

/** The headline figures, then each month's labour cost with the part outside the scope beside it. */
function LabourChart({ labour: l, months }: { labour: LabourInsight; months: TrendMonths }) {
    const t = l.total;
    return (
        <>
            <div className="kpis" style={{ marginBottom: 14 }}>
                <Kpi label="Labour cost" value={<Money short value={t.cost} />} sub={<span>over the last {months} months</span>} />
                <Kpi label="Hours logged" value={fmtH(t.minutes)} />
                <Kpi label="Outside the scope" value={money.pct(t.outsideScopeShare)}
                    sub={<span>of the cost: <Money short value={t.outsideScopeCost} />, {hoursOr(t.outsideScopeMinutes)}</span>} />
            </div>
            <Columns height={200} labelEvery={Math.max(1, Math.ceil(l.months.length / 7))} format={(v) => money.short(v)}
                title={`Labour cost over the last ${months} months`} seriesLabel="Labour cost" ghostLabel="Outside the scope"
                data={l.months.map((m) => ({
                    label: monthLabel(m.month), tip: fmtMonthY(m.month), value: m.totals.cost, ghost: m.totals.outsideScopeCost,
                    note: `${hoursOr(m.totals.minutes)} logged`,
                }))} />
        </>
    );
}

/** Each department's labour, the costliest first, with its share of the whole as the API gives it. Never its people. */
function Departments({ labour: l }: { labour: LabourInsight }) {
    return (
        <div className="panel mt" role="region" aria-label="Labour by department">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Labour by department</div>
                    <div className="panel-sub">Each department's hours and what they cost, the costliest first. Hours logged by people in no department are grouped together.</div>
                </div>
            </div>
            <div className="tbl-wrap">
                <table className="tbl tbl-min-sm" aria-label="Labour by department">
                    <thead><tr><th>Department</th><th className="r">Cost</th><th className="r">Hours</th><th className="r">Outside the scope</th><th className="r">Share of labour</th></tr></thead>
                    <tbody>
                        {l.departments.map((d) => (
                            <tr key={d.teamId ?? "none"}>
                                <td><b>{d.name}</b></td>
                                <td className="r mono">{money.fmt(d.totals.cost)}</td>
                                <td className="r mono">{hoursOr(d.totals.minutes)}</td>
                                <td className="r mono">{hoursOr(d.totals.outsideScopeMinutes)}</td>
                                <td className="r num">{money.pct(d.labourShare)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** Each project's labour, the costliest first, internal work included. */
function Projects({ labour: l, domain, tiles }: { labour: LabourInsight; domain: Domain; tiles?: Map<number, Tile> }) {
    return (
        <div className="panel mt" role="region" aria-label="Labour by project">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Labour by project</div>
                    <div className="panel-sub">Each project's hours and what they cost, the costliest first, internal work included.</div>
                </div>
            </div>
            <div className="tbl-wrap">
                <table className="tbl tbl-min-sm" aria-label="Labour by project">
                    <thead><tr><th>Project</th><th className="r">Cost</th><th className="r">Hours</th><th className="r">Outside-scope hours</th><th className="r">Share of labour</th></tr></thead>
                    <tbody>
                        {l.projects.map((p) => (
                            <tr key={p.projectId}>
                                <td>
                                    <div className="pname">
                                        <ProjectTile icon={tiles?.get(p.projectId)?.icon} tint={tiles?.get(p.projectId)?.tint} size="sm" />
                                        {/* internal work has no Insights tab: its costs are on its Financials tab */}
                                        <ProjectLink domain={domain} id={p.projectId} title={p.title} query={p.billingType === "internal" ? "tab=financials" : "tab=insights"} />
                                        {p.billingType === "internal" && <span className="badge">Internal</span>}
                                    </div>
                                </td>
                                <td className="r mono">{money.fmt(p.totals.cost)}</td>
                                <td className="r mono">{hoursOr(p.totals.minutes)}</td>
                                <td className="r mono">{hoursOr(p.totals.outsideScopeMinutes)}</td>
                                <td className="r num">{money.pct(p.labourShare)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="panel-foot"><BasisNote basis={l.basis} label="How labour is counted" /></div>
        </div>
    );
}
