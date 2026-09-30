import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import LineChart from "@/shared/components/Charts/LineChart";
import { CostRow, MixedCurrency } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Avatar from "@/shared/components/Identity/Avatar";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDate, fmtDateY, fmtH, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import type { Contributor } from "../projectWorkApi";
import { COST_COLORS } from "./moneyParts";
import { useCostTimeline, useDeleteExpense, type Expense } from "./moneyApi";

type ProjectMoney = NonNullable<Project["money"]>;

type FinancialBreakdownProps = {
    project: Project;
    money: ProjectMoney;
    /** Everyone's labour cost, when the viewer sees everyone's work. */
    contributors?: Contributor[];
    entryCount?: number;
    expenses: Expense[] | undefined;
    /** Why the expenses didn't load, with a retry; nothing while they load or once they have. */
    expensesFailed?: { error: unknown; retry: () => void } | null;
    onPerson?: (userId: number) => void;
    /** Left out when the viewer may not add or remove expenses. */
    onAddExpense?: () => void;
    canRemoveExpenses: boolean;
};

/** "Financial breakdown": labour by person, the project's expenses and the cost summary. */
export default function FinancialBreakdown({ project, money: m, contributors, entryCount, expenses, expensesFailed, onPerson, onAddExpense, canRemoveExpenses }: FinancialBreakdownProps) {
    const [removing, setRemoving] = useState<Expense | null>(null);
    const done = m.isLocked;
    const add = !done ? onAddExpense : undefined;
    const labour = (contributors ?? []).filter((c) => (c.labourCost?.usd ?? 0) > 0).sort((a, b) => (b.labourCost?.usd ?? 0) - (a.labourCost?.usd ?? 0));
    const items = expenses ?? [];

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Financial breakdown</div>
                    <div className="panel-sub">Labour comes from the {fmtNumber(entryCount ?? 0)} work entries on this project - nothing is typed in by hand.</div>
                </div>
                {add && <div className="panel-tools"><button className="btn btn-sm" onClick={add}><Icon name="plus" />Add expense</button></div>}
            </div>
            <div className="panel-body">
                <div className="grid g-3">
                    <div>
                        <div className="u" style={{ marginBottom: 6 }}>Employee labour</div>
                        {contributors && (
                            <RankBars format={(v) => money.short(v)} unit="Cost" onClick={onPerson ? (it) => onPerson(Number(it.id)) : undefined}
                                items={labour.map((c) => ({
                                    id: c.userId, label: c.name, value: c.labourCost?.usd ?? 0,
                                    node: <><Avatar person={{ name: c.name }} size={20} /><span className="trunc">{c.name}</span></>,
                                }))} />
                        )}
                        <CostRow strong label="Total labour" value={money.fmt(m.cost.labour)} meta={`${Math.round(m.labourHours)}h`} />
                        {m.cost.unconverted.length > 0 && <div className="mt-s"><MixedCurrency amounts={m.cost.unconverted} /></div>}
                    </div>

                    <div>
                        <div className="u" style={{ marginBottom: 6 }}>Project expenses</div>
                        {!expenses ? (expensesFailed ? <LoadError error={expensesFailed.error} retry={expensesFailed.retry} what="the expenses" /> : <SkeletonLines lines={3} />)
                            : items.length ? items.map((x) => (
                            <CostRow key={x.id} label={x.label} meta={fmtDate(x.spentOn)} value={money.fmt(x.amount, x.currency)} swatch={COST_COLORS.expense}
                                onClick={canRemoveExpenses && !done ? () => setRemoving(x) : undefined} />
                        )) : (
                            <div style={{ padding: "8px 0" }}>
                                <p className="muted">No project expenses yet - stock images, contractors, licences, travel and other one-off costs go here.</p>
                                {add && <button className="btn btn-sm mt-s" onClick={add}><Icon name="plus" />Add the first expense</button>}
                            </div>
                        )}
                        <CostRow strong label="Total expenses" value={money.fmt(m.cost.expenses)} meta={`${items.length} items`} />
                    </div>

                    <div>
                        <div className="u" style={{ marginBottom: 6 }}>Cost summary</div>
                        <CostRow label="Employee labour" value={money.fmt(m.cost.labour)} swatch={COST_COLORS.labour} />
                        <CostRow label="Project expenses" value={money.fmt(m.cost.expenses)} swatch={COST_COLORS.expense} />
                        {m.cost.materials > 0 && <CostRow label="Materials" value={money.fmt(m.cost.materials)} swatch="var(--heat-2)" />}
                        {m.cost.groundLabour > 0 && <CostRow label="Ground labour" value={money.fmt(m.cost.groundLabour)} swatch="var(--warn-mark)" />}
                        <CostRow strong label="Total project cost" value={money.fmt(m.cost.total)} meta={m.labourHours > 0 ? `${money.fmt(m.costPerHour)}/h` : ""} />
                        <p className="hint mt-s">Company expenses - subscriptions, rent and other running costs - are carried by the company, not by this project.</p>
                    </div>
                </div>
            </div>
            {removing && <RemoveExpense project={project} expense={removing} onClose={() => setRemoving(null)} />}
        </div>
    );
}

function RemoveExpense({ project, expense, onClose }: { project: Project; expense: Expense; onClose: () => void }) {
    const remove = useDeleteExpense(project.id);
    return (
        <Modal title="Remove this expense?" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{remove.error ? <span className="err"><Icon name="alert" />{errorMessage(remove.error)}</span> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(expense.id, {
                        onSuccess: () => { toast({ text: "Expense removed", sub: expense.label, icon: "trash" }); onClose(); },
                    })}><Icon name="trash" />Remove</button>
                </>
            }>
            <CostRow label={expense.label} meta={fmtDateY(expense.spentOn)} value={money.fmt(expense.amount, expense.currency)} />
            <p className="hint mt-s">The project's cost and profit drop by this amount straight away.</p>
        </Modal>
    );
}

/** "Payment vs cumulative cost" and "Cost composition over time", at the end of the analytics. */
export function CostFigures({ project, money: m }: { project: Project; money: ProjectMoney }) {
    const timeline = useCostTimeline(project.id, true);
    const internal = project.billingType === "internal";
    const weeks = timeline.data?.weeks ?? [];
    const cost = weeks.map((w) => ({ y: w.costToDate, label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}` }));
    const series = [
        { label: "Cost to date", points: cost, area: true },
        ...(!internal && m.revenue > 0 ? [{ label: "Payment", points: weeks.map((w) => ({ y: m.revenue, label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}` })), ghost: true, dash: true }] : []),
    ];
    const note = internal ? "Cost accumulates from logged hours and project expenses."
        : m.revenue > 0 ? `${Math.round((m.cost.total / m.revenue) * 100)}% of the payment has been consumed so far.` : "No payment recorded for this project yet.";

    if (timeline.isError) return <div className="panel mt"><div className="panel-body"><LoadError error={timeline.error} retry={() => timeline.refetch()} what="the cost over time" /></div></div>;
    return (
        <div className="grid g-2 mt">
            <Figure title={internal ? "Cost accumulation" : "Payment vs cumulative cost"}
                sub={internal ? "How the cost of this internal project has built up." : "How much of the payment has been consumed, week by week."}>
                {!timeline.data ? <SkeletonLines lines={6} /> : (
                    <div>
                        <LineChart series={series} height={190} tickEvery={Math.max(1, Math.ceil((cost.length || 6) / 6))} format={(v) => money.short(v)} />
                        <div className="chart-note">{note}</div>
                    </div>
                )}
            </Figure>
            <Figure title="Cost composition over time" sub="Labour cost per week - the part of the bill that grows while people work.">
                {!timeline.data ? <SkeletonLines lines={6} /> : (
                    <Columns height={180} labelEvery={Math.max(1, Math.ceil(weeks.length / 6))} format={(v) => money.short(v)} seriesLabel="Labour cost"
                        data={weeks.map((w) => ({ label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)}`, value: w.labour, note: fmtH(w.minutes) }))} />
                )}
            </Figure>
        </div>
    );
}
