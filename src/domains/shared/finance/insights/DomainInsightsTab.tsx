import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import HelpHint from "@/domains/shared/help/HelpHint";
import Figure from "@/shared/components/Charts/Figure";
import StackedColumns from "@/shared/components/Charts/StackedColumns";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { MixedCurrency } from "@/shared/components/Data/Money";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { ChipGroup, Segmented } from "@/shared/components/Forms/Filters";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtMonthY, MONTHS } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { BasisNote } from "./InsightParts";
import {
    anomalyLabel, categoryColors, categoryName, riskOf, TREND_MONTHS, useDomainRisks, useExpenseTrends,
    type ExpenseAnomaly, type ExpenseTrends, type ProjectRiskGroup, type ProjectRiskKind, type ProjectRisks, type TrendMonths,
} from "./domainInsightsApi";

type Tile = { icon: string | null; tint: string | null };
type Tiles = Map<number, Tile>;

const monthLabel = (m: string) => MONTHS[+m.slice(5, 7) - 1];

/**
 * The Financials page's Insights tab, for whoever sees the money: the domain's client projects at risk, its spending by
 * category month by month, and what the owner's rules call unusual in it. Every figure and every judgement is the
 * API's; nothing here is added up or decided.
 */
export default function DomainInsightsTab({ domain, tiles }: { domain: Domain; tiles?: Tiles }) {
    const seesMoney = usePermissions().has(P.FINANCIAL_VIEW);
    const [months, setMonths] = useState<TrendMonths>(12);
    if (!seesMoney) return null;
    return (
        <>
            <Risks domain={domain} tiles={tiles} />
            <Spending domain={domain} months={months} onMonths={setMonths} />
        </>
    );
}

/** A project's title, linking to its page (at the tab given) when the viewer may open it. */
function ProjectLink({ domain, id, title, query }: { domain: Domain; id: number; title: string; query: string }) {
    const permissions = usePermissions();
    const path = `projects/${id}`;
    if (!canOpen(permissions, domain, path)) return <span style={{ fontWeight: 600 }}>{title}</span>;
    return <Link to={`/${domain}/${path}?${query}`} style={{ fontWeight: 600 }}>{title}</Link>;
}

/** The domain's client projects with a risk, the most pressing first, filtered by kind with the API's counts. */
function Risks({ domain, tiles }: { domain: Domain; tiles?: Tiles }) {
    const risks = useDomainRisks(domain);
    const [picked, setPicked] = useState<ProjectRiskKind | "all">("all");
    const x = risks.data;
    return (
        <div className="panel" role="region" aria-label="Projects at risk">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">
                        Projects at risk
                        <HelpHint article="project-risks" label="projects at risk">A client project is listed only when one of the owner's rules fired for it. Each risk says what was found and names the rule.</HelpHint>
                    </div>
                    <div className="panel-sub">
                        {x
                            ? `${x.checked} client project${x.checked === 1 ? "" : "s"} checked on ${fmtDateY(x.today)}${x.projects.length ? ", the most pressing first" : ""}.`
                            : "Client projects checked against the owner's rules."}
                    </div>
                </div>
            </div>
            {loadFailed(risks) ? <div className="panel-body"><LoadError error={risks.error} retry={() => risks.refetch()} what="the projects at risk" /></div>
                : !x ? <div className="panel-body"><SkeletonLines lines={6} /></div>
                    : x.projects.length === 0 ? <div className="panel-body"><Empty art="done" title="No project is at risk" text="No client project has a risk by these rules." /></div>
                        : <RiskList risks={x} picked={picked} onPick={setPicked} domain={domain} tiles={tiles} />}
            {x && <div className="panel-foot"><BasisNote basis={x.basis} label="How the risks are found" /></div>}
        </div>
    );
}

type RiskListProps = { risks: ProjectRisks; picked: ProjectRiskKind | "all"; onPick: (kind: ProjectRiskKind | "all") => void; domain: Domain; tiles?: Tiles };

function RiskList({ risks: x, picked, onPick, domain, tiles }: RiskListProps) {
    // a kind that no longer fires after a refresh falls back to them all
    const kind = picked !== "all" && x.counts.some((c) => c.kind === picked) ? picked : "all";
    const shown = kind === "all" ? x.projects : x.projects.filter((g) => g.risks.some((r) => r.kind === kind));
    return (
        <div className="panel-body" style={{ paddingTop: 6 }}>
            <ChipGroup<ProjectRiskKind | "all"> aria-label="Kind of risk" value={kind} onChange={onPick} options={[
                { value: "all", label: "All", count: x.projects.length },
                ...x.counts.map((c) => ({ value: c.kind, label: riskOf(c.kind).label, count: c.projects })),
            ]} />
            <div role="list" aria-label="Projects at risk" className="mt-s">
                {shown.map((g) => <RiskRow key={g.projectId} group={g} domain={domain} tile={tiles?.get(g.projectId)} />)}
            </div>
        </div>
    );
}

/** One project and everything that fired for it: each risk's plain name, what was found, and the rule that found it. */
function RiskRow({ group: g, domain, tile }: { group: ProjectRiskGroup; domain: Domain; tile?: Tile }) {
    return (
        <div className="mini-row" style={{ alignItems: "flex-start" }} role="listitem" aria-label={g.title}>
            <ProjectTile icon={tile?.icon} tint={tile?.tint} size="sm" />
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                    <ProjectLink domain={domain} id={g.projectId} title={g.title} query="tab=insights" />
                    <StatusBadge status={g.status} />
                </div>
                {g.risks.map((r, i) => {
                    const risk = riskOf(r.kind);
                    return (
                        <div key={i} className="mt-s">
                            <div style={{ fontSize: "12.5px" }}>
                                <span className={cx("badge pill", risk.cls)} style={{ marginRight: 6 }}>{risk.label}</span>
                                {r.fact}
                            </div>
                            <div className="hint" style={{ marginTop: 2 }}>Rule: {r.rule}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** The domain's spending by category and what is unusual in it, over the months picked. */
function Spending({ domain, months, onMonths }: { domain: Domain; months: TrendMonths; onMonths: (months: TrendMonths) => void }) {
    const trends = useExpenseTrends(domain, months);
    const failed = loadFailed(trends);
    const t = trends.data;
    return (
        <>
            <SpendingChart trends={t} months={months} domain={domain}
                failed={failed ? <LoadError error={trends.error} retry={() => trends.refetch()} what="the spending" /> : null}
                picker={<Segmented aria-label="Months shown" value={String(months)} onChange={(v) => onMonths(Number(v) as TrendMonths)}
                    options={TREND_MONTHS.map((n) => ({ value: String(n), label: `${n} months` }))} />} />
            {!failed && <UnusualSpending trends={t} months={months} domain={domain} />}
        </>
    );
}

type SpendingChartProps = { trends: ExpenseTrends | undefined; months: TrendMonths; domain: Domain; failed: ReactNode; picker: ReactNode };

/** Each month's spending stacked by category, as the API gives it, with its table twin. */
function SpendingChart({ trends: t, months, domain, failed, picker }: SpendingChartProps) {
    const colors = t ? categoryColors(t.categories) : [];
    const spent = t?.months.some((m) => m.total !== 0) ?? false;
    return (
        <Figure className="mt" title="Spending by category" tools={picker}
            sub={`Each month's ${domain === "design" ? "project" : "site"} expenses in USD, at the rate of the day they were spent, internal work included. This month runs to today.`}
            table={t && spent ? {
                cols: [{ label: "Month" }, ...t.categories.map((c) => ({ label: categoryName(c), right: true })), { label: "Total", right: true }],
                rows: t.months.map((m) => [
                    fmtMonthY(m.month),
                    ...t.categories.map((c) => money.fmt(m.categories.find((x) => x.category === c)?.usd ?? 0)),
                    money.fmt(m.total),
                ]),
            } : undefined}>
            {failed ?? (!t ? <SkeletonLines lines={8} /> : (
                <>
                    {spent ? (
                        <StackedColumns height={210} labelEvery={Math.max(1, Math.ceil(t.months.length / 7))} format={(v) => money.short(v)}
                            title={`Spending by category over the last ${months} months`}
                            series={t.categories.map((c, i) => ({ label: categoryName(c), color: colors[i] }))}
                            data={t.months.map((m) => ({
                                label: monthLabel(m.month), tip: fmtMonthY(m.month), total: m.total,
                                values: t.categories.map((c) => m.categories.find((x) => x.category === c)?.usd ?? 0),
                            }))} />
                    ) : <Empty art="search" title="No spending in these months" text={`Nothing was spent in the last ${months} months.`} />}
                    {t.unconverted.length > 0 && (
                        <div className="chart-note">With no exchange rate on its day, this spending is in none of these figures: <MixedCurrency amounts={t.unconverted} /></div>
                    )}
                </>
            ))}
        </Figure>
    );
}

/** What the owner's rules call unusual in the months shown, newest first, each with the rule that fired. */
function UnusualSpending({ trends: t, months, domain }: { trends: ExpenseTrends | undefined; months: TrendMonths; domain: Domain }) {
    return (
        <div className="panel mt" role="region" aria-label="Unusual spending">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">
                        Unusual spending
                        <HelpHint article="unusual-spending" label="unusual spending">Spending is called unusual only when one of the owner's rules fired: a month far above its category's average, a unit cost well above the last purchases, or the same amount entered twice.</HelpHint>
                    </div>
                    <div className="panel-sub">What the owner's rules call unusual in the last {months} months, newest first.</div>
                </div>
            </div>
            {!t ? <div className="panel-body"><SkeletonLines lines={5} /></div>
                : t.anomalies.length === 0 ? <div className="panel-body"><Empty art="done" title="Nothing unusual" text="No spending in these months is unusual by these rules." /></div>
                    : (
                        <div className="tbl-wrap">
                            <table className="tbl tbl-min-sm" aria-label="Unusual spending">
                                <thead><tr><th>When</th><th>What</th><th>Project</th><th>What was found</th><th className="r">Amount</th></tr></thead>
                                <tbody>{t.anomalies.map((a, i) => <AnomalyRow key={i} anomaly={a} domain={domain} />)}</tbody>
                            </table>
                        </div>
                    )}
            {t && <div className="panel-foot"><BasisNote basis={t.basis} label="How spending is judged" /></div>}
        </div>
    );
}

function AnomalyRow({ anomaly: a, domain }: { anomaly: ExpenseAnomaly; domain: Domain }) {
    // a category's month is about the whole month; the others about the day an expense was spent
    const month = a.kind === "category_high";
    return (
        <tr>
            <td className="muted nowrap" style={{ verticalAlign: "top" }}>{month ? fmtMonthY(a.on) : fmtDateY(a.on)}</td>
            <td style={{ verticalAlign: "top" }}>
                <span className="badge pill pill-low">{anomalyLabel(a.kind)}</span>
                {a.category && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{categoryName(a.category)}</div>}
            </td>
            <td style={{ verticalAlign: "top" }}>
                {a.projectId != null
                    // a project's expenses: a Design project's Financials tab, a site's expenses part
                    ? <ProjectLink domain={domain} id={a.projectId} title={a.projectTitle ?? `Project ${a.projectId}`}
                        query={domain === "execution" ? "tab=financials&part=expenses" : "tab=financials"} />
                    : <span className="muted">Every project</span>}
            </td>
            <td style={{ verticalAlign: "top" }}>
                <div style={{ fontSize: "12.5px" }}>{a.fact}</div>
                <div className="hint" style={{ marginTop: 2 }}>Rule: {a.rule}</div>
            </td>
            <td className="r mono" style={{ verticalAlign: "top" }}>
                {a.usd != null ? money.fmt(a.usd) : <span className="muted" title="No exchange rate on its day">-</span>}
            </td>
        </tr>
    );
}
