import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { CompositionBar } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import LineChart from "@/shared/components/Charts/LineChart";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { MixedCurrency } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { money } from "@/shared/format/money";
import { companyToday, fmtDate, fmtDateY, fmtMonthY, MONTHS } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useCancelOverhead, useCompanyMonths, useOverhead, type OverheadGroup, type OverheadLine } from "./companyApi";
import OverheadModal from "./OverheadModal";
import { GROUP_LABEL } from "./overheadGroups";
import { loadFailed } from "@/api/queryState";

const monthLabel = (m: string) => MONTHS[+m.slice(5, 7) - 1];
const usd = (totals: { currency: string; total: number }[]) => totals.find((t) => t.currency === "USD")?.total ?? 0;
const others = (totals: { currency: string; total: number }[]) => totals.filter((t) => t.currency !== "USD").map((t) => ({ currency: t.currency, amount: t.total }));

/**
 * Subscriptions and running costs (the prototype's P.CompanyOverhead): they belong to the company, never to
 * a business or a project, so only the company area shows them. Kept per currency, never converted.
 */
export default function CompanyExpensesPage() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const canEdit = permissions.has(P.OVERHEAD_MANAGE);
    const overhead = useOverhead();
    const months = useCompanyMonths(13);
    const cancel = useCancelOverhead();
    const [editing, setEditing] = useState<OverheadLine | true | null>(null);
    const o = overhead.data;
    const list = months.data ?? [];
    const active = (o?.lines ?? []).filter((l) => !l.isCancelled);
    // a cancelled line can be taken back until the end of the month it stops after
    const canResume = (l: OverheadLine) => l.isCancelled && l.endedOn != null && l.endedOn >= companyToday();
    const perMonth = usd(o?.monthTotals ?? []);
    const groups = (["software", "operating"] as OverheadGroup[]).map((g) => ({ group: g, total: usd((o?.groupTotals ?? []).filter((t) => t.costGroup === g)) }));
    const year = list.reduce((t, m) => t + m.overhead, 0);
    const current = list[list.length - 1];
    const currentCost = current ? current.labour + current.expenses + current.materials + current.groundLabour + current.overhead : 0;

    function toggle(line: OverheadLine) {
        const resume = line.isCancelled;
        cancel.mutate({ id: line.id, resume }, {
            onSuccess: () => toast({ text: `${line.name} ${resume ? "reactivated" : "cancelled"}`, sub: resume ? "Charged every month again." : "Charged until the end of this month. Past months are unchanged.", icon: "checkCircle" }),
            onError: (e) => toast({ text: `${line.name} wasn't ${resume ? "reactivated" : "cancelled"}`, sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Company expenses</h1>
                    <div className="page-sub">Recurring costs the company carries - never charged to a project, a client or a business.</div>
                </div>
                <div className="page-actions">
                    {permissions.has(P.COMPANY_VIEW) && <button className="btn" onClick={() => navigate("/company/overview")}><Icon name="chartTile" />Company overview</button>}
                    {canEdit && <button className="btn btn-primary" onClick={() => setEditing(true)}><Icon name="plus" />Add expense</button>}
                </div>
            </div>

            {loadFailed(overhead) ? <div className="panel"><div className="panel-body"><LoadError error={overhead.error} retry={() => overhead.refetch()} what="the company's expenses" /></div></div> : (
                <>
                    <KpiStrip loading={!o || !months.data} items={[
                        {
                            key: "month", label: "Company expenses per month", value: money.fmt(perMonth),
                            sub: <span>{active.length} recurring lines{others(o?.monthTotals ?? []).length > 0 && <> · <MixedCurrency amounts={others(o!.monthTotals)} /></>}</span>,
                        },
                        ...groups.map((g) => ({
                            key: g.group, label: GROUP_LABEL[g.group], value: money.fmt(g.total),
                            sub: <span>{Math.round((g.total / (perMonth || 1)) * 100)}% of company expenses</span>,
                        })),
                        { key: "year", label: "Last 13 months", value: money.short(year), sub: <span>charged to the company</span> },
                        {
                            key: "share", label: "Share of this month's cost", value: currentCost ? `${Math.round(((current?.overhead ?? 0) / currentCost) * 100)}%` : "-",
                            sub: <span>of {money.short(currentCost)} total cost</span>,
                        },
                    ]} />

                    <div className="grid g-8-4 mt">
                        <Figure title="What company expenses do to each month" sub="Company profit with company expenses taken out, against what it would have been without it."
                            table={{
                                cols: [{ label: "Month" }, { label: "Company expenses", right: true }, { label: "Profit before", right: true }, { label: "Profit after", right: true }],
                                rows: list.map((m) => [fmtMonthY(m.month), money.fmt(m.overhead), money.fmt(m.profitBeforeOverhead), money.fmt(m.profitAfterOverhead)]),
                            }}>
                            {!months.data ? <SkeletonLines lines={7} /> : (
                                <>
                                    <LineChart height={210} tickEvery={2} format={(v) => money.short(v)} series={[
                                        { label: "Profit before company expenses", ghost: true, dash: true, points: list.map((m) => ({ y: m.profitBeforeOverhead, label: monthLabel(m.month), tip: fmtMonthY(m.month) })) },
                                        { label: "Profit after company expenses", area: true, points: list.map((m) => ({ y: m.profitAfterOverhead, label: monthLabel(m.month), tip: fmtMonthY(m.month) })) },
                                    ]} />
                                    <div className="chart-note">
                                        The gap between the two lines is company expenses - {money.fmt(perMonth)} a month, carried by the company rather than by any one project.
                                    </div>
                                </>
                            )}
                        </Figure>
                        <div className="stack">
                            <Figure title="Company expenses per month" sub="Moves as subscriptions start and stop.">
                                {!months.data ? <SkeletonLines lines={4} /> : year === 0 ? <p className="muted" style={{ padding: "8px 0" }}>No company expenses in the last 13 months.</p> : (
                                    <Columns height={150} labelEvery={3} format={(v) => money.short(v)} seriesLabel="Company expenses"
                                        data={list.map((m) => ({ label: monthLabel(m.month), tip: fmtMonthY(m.month), value: m.overhead }))} />
                                )}
                            </Figure>
                            <Figure title="What it is made of" sub={current ? fmtMonthY(current.month) : ""}>
                                <CompositionBar height={18} parts={groups.map((g, i) => ({ label: GROUP_LABEL[g.group], value: g.total, color: i === 0 ? "var(--heat-3)" : "var(--cost)" }))} />
                                <div className="chart-note">Company expenses are company-wide - they are never charged to a project or a client.</div>
                            </Figure>
                        </div>
                    </div>

                    <div className="panel mt">
                        <div className="panel-head">
                            <div>
                                <div className="panel-title">Recurring monthly expenses</div>
                                <div className="panel-sub">Subscriptions and running costs. They repeat every month and come out of the company's net profit.</div>
                            </div>
                            {canEdit && <div className="panel-tools"><button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}><Icon name="plus" />Add expense</button></div>}
                        </div>
                        {!o ? <div className="panel-body"><SkeletonLines lines={5} /></div> : (
                            <div className="tbl-wrap">
                                <table className="tbl tbl-min-sm">
                                    <thead><tr><th>Name</th><th>Group</th><th className="r">Monthly</th><th className="r">Per year</th><th>Status</th><th>Since</th>{canEdit && <th />}</tr></thead>
                                    <tbody>
                                        {o.lines.slice().sort((a, b) => (b.currentAmount ?? 0) - (a.currentAmount ?? 0)).map((line) => (
                                            <tr key={line.id}>
                                                <td><b>{line.name}</b></td>
                                                <td className="muted">{GROUP_LABEL[line.costGroup]}</td>
                                                <td className="r mono">{line.currentAmount != null ? money.fmt(line.currentAmount, line.currency) : <span className="muted">-</span>}</td>
                                                <td className="r mono muted">{line.perYear != null && !line.isCancelled ? money.short(line.perYear, line.currency) : "-"}</td>
                                                <td>
                                                    {line.isCancelled
                                                        ? <span className="badge badge-archived">Cancelled{line.endedOn ? ` ${fmtDate(line.endedOn)}` : ""}</span>
                                                        : <span className="badge badge-active"><Icon name="circleDot" />Active</span>}
                                                </td>
                                                <td className="muted nowrap">{fmtDateY(line.startedOn)}</td>
                                                {canEdit && (
                                                    <td className="r">
                                                        <MenuButton icon="dots" label={`${line.name} actions`} width={190}>
                                                            {(close) => (
                                                                <div>
                                                                    <button className="pop-item" onClick={() => { close(); setEditing(line); }}><Icon name="edit" />Edit</button>
                                                                    {(!line.isCancelled || canResume(line)) && (
                                                                        <button className="pop-item" onClick={() => { close(); toggle(line); }}>
                                                                            <Icon name={line.isCancelled ? "play" : "pause"} />{line.isCancelled ? "Reactivate" : "Cancel subscription"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </MenuButton>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {o.lines.length === 0 && <p className="muted" style={{ padding: 14 }}>No company expenses yet.</p>}
                            </div>
                        )}
                        <div className="panel-foot"><span className="muted">Cancelling a line stops it after this month - past months keep the cost they carried.</span></div>
                    </div>
                </>
            )}
            {editing && <OverheadModal line={editing === true ? null : editing} onClose={() => setEditing(null)} />}
        </div>
    );
}
