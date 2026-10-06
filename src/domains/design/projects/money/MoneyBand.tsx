import { CompositionBar } from "@/shared/components/Charts/Bars";
import Waterfall from "@/shared/components/Charts/Waterfall";
import { CostRow, MixedCurrency, Money } from "@/shared/components/Data/Money";
import { MarginPill } from "@/shared/components/Data/Pills";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../../shared/projects/projectsApi";
import { COST_COLORS, costParts, profitSteps } from "./moneyParts";
import HelpHint from "@/domains/shared/help/HelpHint";

type ProjectMoney = NonNullable<Project["money"]>;

type MoneyBandProps = {
    project: Project;
    money: ProjectMoney;
    /** Who logged work on it, when known. */
    contributors?: number;
    expenseCount?: number;
    /** Each is left out when the viewer may not do it. */
    onEditPayment?: () => void;
    onAddExpense?: () => void;
    onCloseProject?: () => void;
};

/** A project's profit so far and where its cost sits (the prototype's PF.MoneyBand). */
export default function MoneyBand({ project, money: m, contributors, expenseCount, onEditPayment, onAddExpense, onCloseProject }: MoneyBandProps) {
    const internal = project.billingType === "internal";
    const done = m.isLocked;
    const title = internal ? (done ? "Final cost to the company" : "Cost to the company so far") : done ? "Final profit" : "Profit so far";
    const editPayment = !m.isLocked ? onEditPayment : undefined;
    const addExpense = !done ? onAddExpense : undefined;
    const items = expenseCount ?? 0;

    return (
        <div className="panel">
            <div className="money-band">
                <div>
                    <div className="money-head">
                        <span className="u">{title}</span>
                        {done ? (
                            <span className="locked-field"><Icon name="lock" style={{ width: 12, height: 12 }} />finalised {fmtDate(project.finalizedAt ?? project.completedAt ?? new Date())}</span>
                        ) : <span className="muted" style={{ fontSize: "11.5px" }}>live - updates with every work entry</span>}
                    </div>
                    <div className="row wrap" style={{ gap: 12, alignItems: "baseline", margin: "2px 0 6px" }}>
                        {internal ? <Money value={m.cost.total} size="xl" /> : <Money value={m.profit} size="xl" tone="auto" />}
                        {internal ? <span className="badge">Internal project</span> : (
                            <span className="row" style={{ gap: 2 }}>
                                <MarginPill value={m.margin} hint="Needs 5% progress or 10 logged hours" />
                                <HelpHint article="profit-margin" label="the margin">Profit ÷ revenue. It shows once the project is done, 5% along, or has 10 hours logged.</HelpHint>
                            </span>
                        )}
                        {!done && !internal && m.projected && (
                            <span className="muted" style={{ fontSize: "11.5px" }}>
                                projected <b className={cx("mono", m.projected.profit >= 0 ? "up" : "down")}>{money.short(m.projected.profit)}</b>
                                <span> at completion, at today's burn rate ({project.progressPct}% done)</span>
                            </span>
                        )}
                    </div>
                    {internal ? (
                        <div>
                            <CompositionBar parts={costParts(m)} height={18} />
                            <p className="chart-note">No payment is attached to this project - it is tracked as company investment.</p>
                        </div>
                    ) : <Waterfall steps={profitSteps(m)} height={200} />}
                </div>

                <div>
                    <div className="u" style={{ marginBottom: 8 }}>Where the cost sits</div>
                    {!internal && <div style={{ marginBottom: 10 }}><CompositionBar parts={costParts(m)} /></div>}
                    {!internal && <CostRow label="Payment" value={money.fmt(m.revenue)} meta={m.isLocked ? "locked" : "editable"} onClick={editPayment} />}
                    <CostRow label="Employee labour" swatch={COST_COLORS.labour} value={money.fmt(m.cost.labour)}
                        meta={`${Math.round(m.labourHours)}h${contributors != null ? ` · ${contributors} people` : ""}`} />
                    <CostRow label="Project expenses" swatch={COST_COLORS.expense} value={money.fmt(m.cost.expenses)}
                        meta={`${items} items${addExpense ? " · add" : ""}`} onClick={addExpense} />
                    <CostRow strong label="Total cost" value={money.fmt(m.cost.total)} meta={m.labourHours > 0 ? `${money.fmt(m.costPerHour)}/h` : ""} />
                    {m.cost.unconverted.length > 0 && <div className="mt-s"><MixedCurrency amounts={m.cost.unconverted} /></div>}

                    <div className="alloc-total mt">
                        <Icon name="info" />
                        <div className="grow">
                            <b>Company expenses are not charged here</b>
                            <div className="muted" style={{ fontSize: "11.5px" }}>Subscriptions and running costs belong to the company, not to any one project.</div>
                        </div>
                        {!done && onCloseProject && <button className="btn btn-sm" onClick={onCloseProject}>Close project…</button>}
                    </div>
                </div>
            </div>
        </div>
    );
}
