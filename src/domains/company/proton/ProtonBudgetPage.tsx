import { useState, type ReactNode } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { useAllProtonActions, useProtonBudget, useTopUpBudget, type ProtonBudget } from "@/domains/shared/proton/protonApi";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { money } from "@/shared/format/money";
import { fmtDate, fmtDateY, fmtMonthY, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";

/** Proton's costs are small: a question is a few cents, so they keep a third decimal below a dollar. */
const cost = (usd: number) => (usd < 1 ? `$${usd.toFixed(3)}` : money.exact(usd, "USD", { cents: true }));
const domainName = (domain: string | null) => (domain === "design" ? "Design" : domain === "execution" ? "Execution" : "Company-wide");

/**
 * Proton's estimated cost this month against the budget, and where it went (for super admins: proton_budget:manage).
 * Everyone else only ever sees their question allowance.
 */
export default function ProtonBudgetPage() {
    const budget = useProtonBudget();
    const b = budget.data;

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Proton</h1>
                    <div className="page-sub">
                        The assistant's estimated cost this month against its budget{b ? ` (${fmtMonthY(b.month)}, ${b.model})` : ""}. The provider's bill is the final figure.
                    </div>
                </div>
            </div>

            {loadFailed(budget) ? <div className="panel"><div className="panel-body"><LoadError error={budget.error} retry={() => budget.refetch()} what="Proton's budget" /></div></div> : (
                <>
                    <KpiStrip loading={!b} items={[
                        { key: "budget", label: "Budget this month", value: b ? money.exact(b.budgetUsd, "USD", { cents: true }) : "", sub: b && <span>{money.exact(b.monthlyBudgetUsd)} monthly{b.topUpsUsd > 0 && ` + ${money.exact(b.topUpsUsd, "USD", { cents: true })} added`}</span> },
                        { key: "spent", label: "Spent (estimated)", value: b ? cost(b.spentUsd) : "", sub: b && <span>{b.usedPct}% of the budget</span> },
                        { key: "left", label: "Remaining", value: b ? cost(b.remainingUsd) : "", sub: <span>questions stop at zero until a top-up</span> },
                        { key: "questions", label: "Questions", value: b ? fmtNumber(b.questions) : "", sub: b && <span>{b.questions ? `${cost(b.spentUsd / b.questions)} on average` : "none yet"}</span> },
                    ]} />
                    {!b ? <div className="panel mt"><div className="panel-body"><SkeletonLines lines={6} /></div></div> : <Breakdown budget={b} />}
                </>
            )}
        </div>
    );
}

function Breakdown({ budget: b }: { budget: ProtonBudget }) {
    return (
        <>
            <div className="grid g-8-4 mt">
                <Table title="By person" sub="Who asked, and what their questions cost." empty={b.byUser.length === 0}
                    head={["Person", "Questions", "Tokens", "Cost"]}
                    rows={b.byUser.map((u) => [<b key="n">{u.name}</b>, fmtNumber(u.questions), fmtNumber(u.tokens), cost(u.costUsd)])} />
                <TopUp budget={b} />
            </div>
            <div className="grid g-2 mt">
                <Table title="By domain" sub="The people's domain as it is now." empty={b.byDomain.length === 0}
                    head={["Domain", "Questions", "Cost"]}
                    rows={b.byDomain.map((d) => [domainName(d.domain), fmtNumber(d.questions), cost(d.costUsd)])} />
                <Table title="By day" empty={b.byDay.length === 0}
                    head={["Day", "Questions", "Cost"]}
                    rows={b.byDay.map((d) => [fmtDate(d.day), fmtNumber(d.questions), cost(d.costUsd)])} />
            </div>
            <Table title="By tool" className="mt"
                sub="How often each tool ran and how long it took. A tool's own share of a question's cost can't be told apart, so the cost is that of the questions it was part of."
                empty={b.byTool.length === 0}
                head={["Tool", "Calls", "Average time", "Questions", "Their cost"]}
                rows={b.byTool.map((t) => [<span key="t" className="mono">{t.tool}</span>, fmtNumber(t.calls), `${fmtNumber(t.averageMs)} ms`, fmtNumber(t.questions), cost(t.questionCostUsd)])} />
            <Table title="Most expensive conversations" className="mt" sub="Long conversations re-send their history with every question." empty={b.topConversations.length === 0}
                head={["Person", "Questions", "Tool calls", "Cost"]}
                rows={b.topConversations.map((c) => [c.name, fmtNumber(c.questions), fmtNumber(c.toolCalls), cost(c.costUsd)])} />
            <Table title="Top-ups this month" className="mt" empty={b.topUps.length === 0}
                head={["Added", "By", "Note", "Amount"]}
                rows={b.topUps.map((t) => [fmtDateY(t.addedAt), t.addedBy, t.note ?? "", money.exact(t.amountUsd, "USD", { cents: true })])} />
            <Proposals />
        </>
    );
}

const STATUS: Record<string, string> = {
    pending: "Waiting", executing: "Running", succeeded: "Done", failed: "Failed", cancelled: "Cancelled", superseded: "Replaced", expired: "Expired",
};

/** What Proton proposed to whom, and what became of it: the last 50 changes, everyone's. */
function Proposals() {
    const actions = useAllProtonActions();
    if (loadFailed(actions)) return <div className="panel mt"><div className="panel-body"><LoadError error={actions.error} retry={() => actions.refetch()} what="Proton's changes" /></div></div>;
    if (!actions.data) return <div className="panel mt"><div className="panel-body"><SkeletonLines lines={3} /></div></div>;
    return (
        <Table title="Changes Proton proposed" className="mt" sub="The last 50, everyone's. Nothing runs until the person confirms it." empty={actions.data.length === 0}
            emptyText="Proton hasn't proposed any changes yet."
            head={["Proposed", "Person", "Change", "Outcome"]}
            rows={actions.data.map((a) => [fmtDateY(a.createdAt), a.who ?? "", a.title, a.status === "failed" && a.errorMessage ? `Failed: ${a.errorMessage}` : STATUS[a.status] ?? a.status])} />
    );
}

function TopUp({ budget }: { budget: ProtonBudget }) {
    const topUp = useTopUpBudget();
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");
    const value = Number(amount);
    const valid = amount.trim() !== "" && value > 0 && value <= 10_000;

    const submit = () => {
        if (!valid || topUp.isPending) return;
        topUp.mutate({ amountUsd: value, note: note.trim() || null }, {
            onSuccess: (next) => {
                setAmount("");
                setNote("");
                toast({ text: `${money.exact(value, "USD", { cents: true })} added`, sub: `${cost(next.remainingUsd)} left this month.`, icon: "checkCircle" });
            },
            onError: (e) => toast({ text: "The budget wasn't topped up", sub: errorMessage(e), icon: "alert" }),
        });
    };

    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Add to this month</div><div className="panel-sub">Top-ups are kept as they are, never edited.</div></div></div>
            <form className="panel-body stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div className="field">
                    <label className="label" htmlFor="pb-amount">Amount (USD)</label>
                    <input id="pb-amount" className="input" type="number" min={0.01} max={10000} step={0.01} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="pb-note">Note (optional)</label>
                    <input id="pb-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button className="btn btn-primary" type="submit" disabled={!valid || topUp.isPending}><Icon name="plus" />Add to the budget</button>
                {budget.remainingUsd <= 0 && <div className="muted">The budget is used up: nobody can ask Proton until it is topped up.</div>}
            </form>
        </div>
    );
}

function Table({ title, sub, head, rows, empty, emptyText = "Nothing this month yet.", className }: {
    title: string;
    sub?: string;
    emptyText?: string;
    head: string[];
    rows: ReactNode[][];
    empty: boolean;
    className?: string;
}) {
    return (
        <div className={`panel${className ? ` ${className}` : ""}`}>
            <div className="panel-head"><div><div className="panel-title">{title}</div>{sub && <div className="panel-sub">{sub}</div>}</div></div>
            {empty ? <p className="muted" style={{ padding: 14 }}>{emptyText}</p> : (
                <div className="tbl-wrap">
                    <table className="tbl tbl-min-sm" aria-label={title}>
                        <thead><tr>{head.map((h, i) => <th key={h} className={i > 0 ? "r" : undefined}>{h}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((row, r) => (
                                <tr key={r}>{row.map((cell, i) => <td key={i} className={i > 0 ? "r mono" : undefined}>{cell}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
