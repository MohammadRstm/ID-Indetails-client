import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Bar } from "@/shared/components/Data/Bits";
import { MixedCurrency } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useProjectDepartments } from "../../../design/projects/departments/departmentsApi";
import type { Project } from "../../projects/projectsApi";
import {
    BUDGET_REASON_MAX, budgetLineKeys, currentAmount, useProjectBudget, useSetProjectBudget,
    type BudgetLine, type BudgetLineKey, type BudgetVersion, type ProjectBudget,
} from "./budgetApi";

/**
 * "Budget" on a project's Financials tab (financial:view): what the project may cost, line by line, against what it
 * has cost so far, and every version it has had. A line that cost more than its budget is shown in red. Every figure
 * is the API's, in USD before TVA.
 */
export default function BudgetPanel({ project }: { project: Project }) {
    const permissions = usePermissions();
    const budget = useProjectBudget(project.id, permissions.has(P.FINANCIAL_VIEW));
    const [dialog, setDialog] = useState<"set" | "history" | null>(null);
    // a Design project's budget is its money; a site's is part of its pricing
    const canSet = permissions.has(project.domain === "execution" ? P.PROJECT_PRICING_MANAGE : P.FINANCIAL_WRITE);
    const current = budget.data?.current ?? null;

    return (
        <div className="panel mt" role="region" aria-label="Budget">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">
                        Budget{current && <span className="badge" style={{ marginLeft: 8 }}>Version {current.version}</span>}
                    </div>
                    <div className="panel-sub">
                        {current ? <VersionLine version={current} /> : "What the project may cost, line by line, against what it has cost so far. In USD, before TVA."}
                    </div>
                </div>
                {current && (
                    <div className="panel-tools">
                        <button className="btn btn-sm" onClick={() => setDialog("history")}><Icon name="clock" />History</button>
                        {canSet && <button className="btn btn-sm" onClick={() => setDialog("set")}><Icon name="edit" />Revise budget</button>}
                    </div>
                )}
            </div>
            {loadFailed(budget) ? <div className="panel-body"><LoadError error={budget.error} retry={() => budget.refetch()} what="the budget" /></div>
                : !budget.data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : !current ? (
                        <div className="panel-body">
                            <p className="muted">No budget yet: nothing to compare the project's cost with.</p>
                            {canSet && <button className="btn btn-sm mt-s" onClick={() => setDialog("set")}><Icon name="plus" />Set a budget</button>}
                        </div>
                    ) : <BudgetLines budget={budget.data} current={current} />}
            {dialog === "set" && canSet && budget.data && <BudgetModal project={project} budget={budget.data} onClose={() => setDialog(null)} />}
            {dialog === "history" && budget.data && <HistoryModal project={project} history={budget.data.history} onClose={() => setDialog(null)} />}
        </div>
    );
}

/** "From Sep 1, 2026 · set by Rana Saab on Sep 28, 2026 · The client added a guest house." */
function VersionLine({ version: v }: { version: BudgetVersion }) {
    return (
        <>
            From <b className="sec">{fmtDateY(v.effectiveFrom)}</b> · set by {v.setByName} on {fmtDateY(v.setAt)}
            {v.reason && <> · {v.reason}</>}
        </>
    );
}

function BudgetLines({ budget, current }: { budget: ProjectBudget; current: BudgetVersion }) {
    return (
        <>
            <div className="tbl-wrap">
                <table className="tbl tbl-min-sm" aria-label="Budget lines">
                    <thead>
                        <tr>
                            <th>Line</th>
                            <th className="r">Budget</th>
                            <th style={{ width: 140 }}>Used</th>
                            <th className="r">Cost so far</th>
                            <th className="r">Left</th>
                        </tr>
                    </thead>
                    <tbody>
                        {budget.lines.map((l) => <LineRow key={l.teamId != null ? `team-${l.teamId}` : `cat-${l.category}`} line={l} />)}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td style={{ fontWeight: 650 }}>Total budget</td>
                            <td className="r mono" style={{ fontWeight: 650 }}>{money.fmt(current.total)}</td>
                            <td />
                            <td />
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
            {(budget.uncovered > 0 || budget.unconverted.length > 0) && (
                <div className="panel-body">
                    {budget.uncovered > 0 && (
                        <div className="hint" role="note" aria-label="Cost in no line">
                            <b className="mono">{money.fmt(budget.uncovered)}</b> of the project's cost is in no line of the budget: it counts in the project's cost, not against a line.
                        </div>
                    )}
                    {budget.unconverted.length > 0 && (
                        <div className="hint" role="note" aria-label="Not converted">
                            <MixedCurrency amounts={budget.unconverted} /> in another currency with no exchange rate for its day is left out of the cost above.
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

function LineRow({ line: l }: { line: BudgetLine }) {
    const over = l.left < 0;
    return (
        <tr className={cx(over && "dept-over")} aria-label={l.name}>
            <td>
                <div className="dept-name">{l.name}</div>
                {over && <div className="money down" style={{ fontSize: 11.5 }}>Over budget</div>}
            </td>
            <td className="r mono">{money.fmt(l.amount)}</td>
            <td><Bar value={l.amount > 0 ? (l.cost / l.amount) * 100 : 0} tone={over ? "loss" : undefined} /></td>
            <td className={cx("r mono", over && "money down")}>{money.fmt(l.cost)}</td>
            <td className={cx("r mono", over && "money down")}>{money.fmt(l.left)}</td>
        </tr>
    );
}

/** Every version of the budget, newest first: its total, from when, who set it and why. */
function HistoryModal({ project, history, onClose }: { project: Project; history: BudgetVersion[]; onClose: () => void }) {
    return (
        <Modal title="Budget history" sub={project.title} onClose={onClose} foot={<button className="btn" onClick={onClose}>Close</button>}>
            <ol className="pay-hist" aria-label="Budget versions">
                {history.map((v) => (
                    <li key={v.version} className="pay-hist-row" aria-label={`Version ${v.version}`}>
                        <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                            <b>Version {v.version} · <span className="mono">{money.fmt(v.total)}</span></b>
                            <span className="muted" style={{ fontSize: 12 }}>{fmtDateY(v.setAt)} · {v.setByName}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>From {fmtDateY(v.effectiveFrom)}</div>
                        {v.reason && <div style={{ fontSize: 13 }}>{v.reason}</div>}
                    </li>
                ))}
            </ol>
        </Modal>
    );
}

/**
 * A new version of the budget: an amount for each line (the budget now, to start from), why it changes and the day
 * it applies from (today, never later). What the API refuses shows beside its field until it is changed.
 */
function BudgetModal({ project, budget, onClose }: { project: Project; budget: ProjectBudget; onClose: () => void }) {
    const site = project.domain === "execution";
    const departments = useProjectDepartments(project.id, !site);
    const keysReady = site || !!departments.data;
    const lineKeys = keysReady ? budgetLineKeys(project.domain, departments.data?.departments ?? []) : [];
    const today = companyToday();
    const save = useSetProjectBudget(project.id);
    const errors = useFormErrors();
    const revising = budget.current != null;
    // what was typed for each line; a line not typed in starts at what the budget has now
    const [typed, setTyped] = useState<Record<string, number>>({});
    const [reason, setReason] = useState("");
    const [day, setDay] = useState(today);
    // the lines sent, in order, so a refusal of lines[i] shows beside its line
    const [sent, setSent] = useState<string[]>([]);
    const refused = toApiError(save.error);
    const edited = () => { if (save.error) save.reset(); };
    const amountOf = (k: BudgetLineKey) => typed[k.id] ?? currentAmount(budget, k);
    const lineRefused = (k: BudgetLineKey) => {
        const i = sent.indexOf(k.id);
        return i < 0 ? undefined : refused.fieldErrors[`lines[${i}].amount`] ?? refused.fieldErrors[`lines[${i}]`];
    };

    const filled = lineKeys.filter((k) => (amountOf(k) ?? 0) > 0);
    const linesError = keysReady && filled.length === 0 && "Give at least one line an amount.";
    const reasonError = !reason.trim() ? "Say why the budget is set or changes."
        : reason.trim().length > BUDGET_REASON_MAX && `At most ${BUDGET_REASON_MAX} characters.`;
    const dayError = !day ? "Pick the day it applies from." : day > today && "The day can't be in the future.";
    // the foot has the failure only when no field is what the API named
    const fieldRefused = refused.fieldErrors.reason ?? refused.fieldErrors.effectiveFrom ?? refused.fieldErrors.lines
        ?? lineKeys.map(lineRefused).find((m) => m != null);

    function submit() {
        if (save.isPending || !keysReady) return;
        if (linesError || reasonError || dayError) return errors.tried();
        setSent(filled.map((k) => k.id));
        save.mutate({
            reason: reason.trim(),
            effectiveFrom: day,
            lines: filled.map((k) => ({ teamId: k.teamId, category: k.category, amount: amountOf(k) ?? 0 })),
        }, {
            onSuccess: (saved) => {
                toast({ text: revising ? `Budget revised: version ${saved.current?.version ?? ""}`.trim() : "Budget set", sub: project.title, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title={revising ? "Revise budget" : "Set a budget"} sub={project.title} onClose={save.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {save.error && !fieldRefused ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(save.error)}</span>
                            : revising ? "The budget now stays in its history." : "In USD, before TVA."}
                    </div>
                    <button className="btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending || !keysReady} onClick={submit}>
                        <Icon name="check" />{save.isPending ? "Saving…" : "Save"}
                    </button>
                </>
            }>
            {!keysReady ? (
                loadFailed(departments) ? <LoadError error={departments.error} retry={() => departments.refetch()} what="the departments" /> : <SkeletonLines lines={4} />
            ) : (
                <>
                    <div className="hint" style={{ marginBottom: 10 }}>
                        {site ? "What the site may spend on each kind of cost, in USD before TVA." : "What each department's hours and the project's expenses may cost, in USD before TVA."} Leave a line empty to give it no budget.
                    </div>
                    {lineKeys.map((k) => (
                        <div key={k.id} className="field">
                            <div className="row" style={{ gap: 10, alignItems: "center" }}>
                                <label className="label grow" htmlFor={`budget-${k.id}`} style={{ margin: 0 }}>{k.name}</label>
                                <div style={{ width: 180 }}>
                                    <AmountField id={`budget-${k.id}`} currencies={false} value={amountOf(k)}
                                        onChange={(v) => { edited(); setTyped((t) => ({ ...t, [k.id]: v })); }} onBlur={errors.touch("lines")} />
                                </div>
                            </div>
                            <FieldError message={lineRefused(k)} />
                        </div>
                    ))}
                    <FieldError message={errors.show("lines", linesError) ?? refused.fieldErrors.lines} />
                </>
            )}
            <div className="field mt">
                <label className="label required" htmlFor="budget-from">Applies from</label>
                <DateInput id="budget-from" className="input mono" value={day} max={today} onChange={(v) => { edited(); setDay(v); }} />
                <FieldError message={errors.show("day", dayError) ?? refused.fieldErrors.effectiveFrom} />
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="budget-why">Why it changes</label>
                <AutoGrowTextarea id="budget-why" className="input" minRows={2} maxRows={8} maxLength={BUDGET_REASON_MAX} value={reason}
                    placeholder={revising ? "e.g. The client added a guest house." : "e.g. Agreed with the client at kick-off."}
                    onChange={(e) => { edited(); setReason(e.target.value); }} onBlur={errors.touch("reason")} />
                <div className="hint">Kept in the budget's history.</div>
                <FieldError message={errors.show("reason", reasonError) ?? refused.fieldErrors.reason} />
            </div>
        </Modal>
    );
}
