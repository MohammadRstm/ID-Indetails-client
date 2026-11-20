import { useState } from "react";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { loadFailed } from "@/api/queryState";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { Bar } from "@/shared/components/Data/Bits";
import { Kpi } from "@/shared/components/Data/Kpi";
import { MixedCurrency } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import { PersonLine } from "@/shared/components/Identity/People";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtH } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { clickable } from "@/shared/utils/clickable";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../../shared/projects/projectsApi";
import { DepartmentPicker } from "./DepartmentPicker";
import { PlanHoursModal, PlannedHoursCell } from "./PlannedHours";
import {
    sharePct, useDepartmentHistory, useProjectDepartments, useSetDepartments, useSetShares,
    type DepartmentChange, type DepartmentMoney, type ProjectDepartment,
} from "./departmentsApi";

const REASON_MAX = 500;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

const OTHER_NOTE = "Logged by people in no department, or in one no longer on the project: in the project's cost, in no budget.";

/**
 * "Departments" on a Design project's Financials tab: a row for each department with its share of the price, its
 * budget, what the hours logged in it cost (red when that's over the budget), its planned hours with how far along they
 * are, and what's left. A row opens who logged its hours and what each of them cost.
 */
export default function DepartmentsPanel({ project, locked, onEditDepartments }: { project: Project; locked: boolean; onEditDepartments?: () => void }) {
    const permissions = usePermissions();
    const departments = useProjectDepartments(project.id);
    const [dialog, setDialog] = useState<"shares" | "history" | "plan" | null>(null);
    const [opened, setOpened] = useState<ProjectDepartment | null>(null);
    const list = departments.data?.departments ?? [];
    const other = departments.data?.other
        ? { id: 0, name: "Other hours", share: null, money: departments.data.other, plannedMinutes: null, loggedMinutes: null, progress: null }
        : null;
    const canShare = !locked && permissions.has(P.FINANCIAL_WRITE) && list.length >= 2;
    // planned hours are hours, not money: they stay open once the money is locked
    const canPlan = permissions.has(P.PROJECT_EDIT) && list.length > 0;
    const edit = !locked ? onEditDepartments : undefined;

    return (
        <div className="panel mt" role="region" aria-label="Departments">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">
                        Departments{departments.data?.name && <span className="badge" style={{ marginLeft: 8 }}>{departments.data.name}</span>}
                    </div>
                    <div className="panel-sub">Each department's share of the payment before TVA, what the hours logged in it cost, and its hours against those planned. Open one for who logged them. Expenses stay with the project.</div>
                </div>
                <div className="panel-tools">
                    {list.length > 0 && <button className="btn btn-sm" onClick={() => setDialog("history")}><Icon name="clock" />History</button>}
                    {canShare && <button className="btn btn-sm" onClick={() => setDialog("shares")}><Icon name="edit" />Edit shares</button>}
                    {canPlan && <button className="btn btn-sm" onClick={() => setDialog("plan")}><Icon name="clock" />Plan hours</button>}
                    {edit && <button className="btn btn-sm" onClick={edit}><Icon name="people" />Change departments</button>}
                </div>
            </div>
            {loadFailed(departments) ? <div className="panel-body"><LoadError error={departments.error} retry={() => departments.refetch()} what="the departments" /></div>
                : !departments.data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : list.length === 0 ? (
                        <div className="panel-body">
                            <p className="muted">No departments yet: the whole payment is one budget, and anyone in Design can log hours on it.</p>
                            {edit && <button className="btn btn-sm mt-s" onClick={edit}><Icon name="plus" />Choose departments</button>}
                        </div>
                    ) : (
                        <div className="tbl-wrap">
                            <table className="tbl tbl-min-sm" aria-label="Department budgets">
                                <thead>
                                    <tr>
                                        <th>Department</th>
                                        <th className="r">Share</th>
                                        <th className="r">Budget</th>
                                        <th style={{ width: 140 }}>Used</th>
                                        <th className="r">Hours</th>
                                        <th style={{ width: 150 }}>Planned hours</th>
                                        <th className="r">Cost</th>
                                        <th className="r">Left</th>
                                        <th style={{ width: 28 }} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map((d) => <DepartmentRow key={d.id} department={d} onOpen={() => setOpened(d)} />)}
                                    {other && <DepartmentRow department={other} onOpen={() => setOpened(other)} />}
                                </tbody>
                            </table>
                        </div>
                    )}
            {dialog === "shares" && <SharesModal project={project} departments={list} onClose={() => setDialog(null)} />}
            {dialog === "history" && <HistoryModal project={project} onClose={() => setDialog(null)} />}
            {dialog === "plan" && <PlanHoursModal project={project} departments={list} onClose={() => setDialog(null)} />}
            {opened && <DepartmentCostModal project={project} department={opened} onClose={() => setOpened(null)} />}
        </div>
    );
}

/** A department with a budget (not "Other hours") whose hours cost more than it: a loss, shown in red. */
function overBudget(d: ProjectDepartment) {
    return d.share != null && (d.money as DepartmentMoney).left < 0;
}

function DepartmentRow({ department: d, onOpen }: { department: ProjectDepartment; onOpen: () => void }) {
    const m = d.money as DepartmentMoney;
    const budgeted = d.share != null;
    const over = overBudget(d);
    return (
        <tr className={cx("click", over && "dept-over")} aria-label={d.name} {...clickable(onOpen)}>
            <td>
                <div className="dept-name">{d.name}</div>
                {!budgeted && <div className="muted" style={{ fontSize: 11.5 }}>In no budget</div>}
            </td>
            <td className="r mono">{budgeted ? sharePct(d.share!) : "-"}</td>
            <td className="r mono">{budgeted ? money.fmt(m.budget) : "-"}</td>
            <td>{budgeted && <Bar value={m.budget > 0 ? (m.cost / m.budget) * 100 : 0} tone={over ? "loss" : undefined} />}</td>
            <td className="r mono">{fmtH(m.minutes)}</td>
            <td>{budgeted && <PlannedHoursCell department={d} />}</td>
            <td className={cx("r mono", over && "money down")}>
                {money.fmt(m.cost)}
                {m.unconverted.length > 0 && <div><MixedCurrency amounts={m.unconverted} /></div>}
            </td>
            <td className={cx("r mono", over && "money down")}>{budgeted ? money.fmt(m.left) : "-"}</td>
            <td className="r muted"><Icon name="chevronRight" /></td>
        </tr>
    );
}

/** A month's hours, rate and cost: "Sep 2026: 50h at $13.25/h · $4,000". */
const monthLine = (x: DepartmentMoney["people"][number]["months"][number]) =>
    `${MONTH.format(new Date(x.month))}: ${fmtH(x.minutes)}${x.hourlyRate != null ? ` at ${money.exact(x.hourlyRate)}/h` : ""} · ${money.fmt(x.cost)}`;

/** Someone's hourly cost over their months in the department: one rate, or the lowest to the highest when it changed. */
function rateOf(months: DepartmentMoney["people"][number]["months"]) {
    const rates = months.flatMap((x) => (x.hourlyRate != null ? [x.hourlyRate] : []));
    if (rates.length === 0) return "-";
    const low = Math.min(...rates), high = Math.max(...rates);
    return low === high ? `${money.exact(low)}/h` : `${money.exact(low)}–${money.exact(high)}/h`;
}

/** One department's money, then who logged its hours: each person's hours, rate, share of its cost and cost, most first. */
function DepartmentCostModal({ project, department: d, onClose }: { project: Project; department: ProjectDepartment; onClose: () => void }) {
    const m = d.money as DepartmentMoney;
    const over = overBudget(d);
    const people = [...m.people].sort((a, b) => b.cost - a.cost);
    return (
        <Modal size="lg" title={d.name} sub={`${project.title}${d.share != null ? ` · ${sharePct(d.share)} of the payment` : ""}`} onClose={onClose}
            foot={<button className="btn" onClick={onClose}>Close</button>}>
            {d.share != null ? (
                <div className="kpis" style={{ borderRadius: "var(--r2)" }}>
                    <Kpi label="Budget" value={money.fmt(m.budget)} />
                    <Kpi label={`Cost · ${fmtH(m.minutes)}`} value={<span className={cx("mono", over && "down")}>{money.fmt(m.cost)}</span>}
                        sub={m.unconverted.length > 0 ? <MixedCurrency amounts={m.unconverted} /> : undefined} />
                    <Kpi label={over ? "Over budget" : "Left"} value={<span className={cx("mono", over && "down")}>{money.fmt(Math.abs(m.left))}</span>} />
                </div>
            ) : <div className="hint">{OTHER_NOTE}</div>}
            {people.length === 0 ? <p className="muted mt">No hours logged in it yet.</p> : (
                <div className="tbl-wrap mt">
                    <table className="tbl" aria-label="Cost by person">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th className="r">Hours</th>
                                <th className="r">Rate</th>
                                <th style={{ width: 130 }}>Share of cost</th>
                                <th className="r">Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {people.map((p) => (
                                <tr key={p.person.id} aria-label={p.person.name} title={p.months.map(monthLine).join("\n")}>
                                    <td><PersonLine person={{ id: p.person.id, name: p.person.name }} size={24} sub={false} /></td>
                                    <td className="r mono">{fmtH(p.minutes)}</td>
                                    <td className="r mono">{rateOf(p.months)}</td>
                                    <td><Bar value={m.cost > 0 ? (p.cost / m.cost) * 100 : 0} /></td>
                                    <td className="r mono">{money.fmt(p.cost)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td style={{ fontWeight: 650 }}>Total</td>
                                <td className="r mono" style={{ fontWeight: 650 }}>{fmtH(m.minutes)}</td>
                                <td />
                                <td />
                                <td className={cx("r mono", over && "money down")} style={{ fontWeight: 650 }}>
                                    {money.fmt(m.cost)}
                                    {m.unconverted.length > 0 && <div><MixedCurrency amounts={m.unconverted} /></div>}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </Modal>
    );
}

/** Each department's share in percent, adding up to 100%, and why they change (financial:write). */
function SharesModal({ project, departments, onClose }: { project: Project; departments: ProjectDepartment[]; onClose: () => void }) {
    const save = useSetShares(project.id);
    const errors = useFormErrors();
    const [pcts, setPcts] = useState<Record<number, string>>(
        () => Object.fromEntries(departments.map((d) => [d.id, String(Number(((d.share ?? 0) * 100).toFixed(2)))])));
    const [reason, setReason] = useState("");
    const values = departments.map((d) => ({ id: d.id, pct: Number(pcts[d.id]) }));
    const total = Math.round(values.reduce((sum, v) => sum + (Number.isFinite(v.pct) ? v.pct : 0), 0) * 100) / 100;
    const sharesError = values.some((v) => !Number.isFinite(v.pct) || v.pct < 0 || v.pct > 100 || Math.round(v.pct * 100) !== v.pct * 100)
        ? "Each share is between 0% and 100%, to two decimal places."
        : total !== 100 && `The shares add up to ${total}%: they must make 100%.`;
    const unchanged = departments.every((d) => Math.round((d.share ?? 0) * 10000) === Math.round(Number(pcts[d.id]) * 100));
    const reasonError = reason.trim().length > REASON_MAX && `At most ${REASON_MAX} characters.`;

    function submit() {
        if (save.isPending) return;
        if (sharesError || reasonError || unchanged) return errors.tried();
        save.mutate({
            shares: values.map((v) => ({ departmentId: v.id, share: Math.round(v.pct * 100) / 10000 })),
            reason: reason.trim() || null,
        }, {
            onSuccess: () => {
                toast({ text: "Department shares saved", sub: project.title, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Department shares" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error ? <FormFailure error={save.error} onForced={onClose} /> : `Total ${total}%`}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            {departments.map((d) => (
                <div key={d.id} className="field row" style={{ gap: 10, alignItems: "center" }}>
                    <label className="label grow" htmlFor={`share-${d.id}`} style={{ margin: 0 }}>{d.name}</label>
                    <input id={`share-${d.id}`} className="input mono" style={{ width: 96, textAlign: "right" }} inputMode="decimal"
                        value={pcts[d.id] ?? ""} onChange={(e) => setPcts({ ...pcts, [d.id]: e.target.value })} onBlur={errors.touch("shares")} />
                    <span className="muted">%</span>
                </div>
            ))}
            <FieldError message={errors.show("shares", sharesError || (unchanged && "The shares are already these: change one of them."))} />
            <div className="field mt">
                <label className="label" htmlFor="share-why">Why they change</label>
                <AutoGrowTextarea id="share-why" className="input" minRows={2} maxRows={8} maxLength={REASON_MAX} value={reason}
                    placeholder="e.g. Structure needs less than planned." onChange={(e) => setReason(e.target.value)} onBlur={errors.touch("reason")} />
                <div className="hint">Optional. Kept in the departments' history.</div>
                <FieldError message={errors.show("reason", reasonError)} />
            </div>
        </Modal>
    );
}

const CHANGE_TITLE: Record<DepartmentChange["kind"], string> = {
    created: "Departments chosen",
    departments: "Departments changed: shares back to equal",
    shares: "Shares changed",
};

/** Every change of the split, newest first: who, when, why, and the shares before and after. */
function HistoryModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const history = useDepartmentHistory(project.id);
    return (
        <Modal title="Departments history" sub={project.title} onClose={onClose} foot={<button className="btn" onClick={onClose}>Close</button>}>
            {history.data ? (
                <ol className="pay-hist" aria-label="Department changes">
                    {history.data.map((c) => (
                        <li key={c.id} className="pay-hist-row">
                            <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                                <b>{CHANGE_TITLE[c.kind]}</b>
                                <span className="muted" style={{ fontSize: 12 }}>{fmtDateY(c.changedAt)} · {c.changedBy.name}</span>
                            </div>
                            {c.reason && <div style={{ fontSize: 13 }}>{c.reason}</div>}
                            <div className="muted" style={{ fontSize: 12 }}>
                                {c.before.length > 0 && <>{c.before.map((s) => `${s.name} ${sharePct(s.share)}`).join(", ")} → </>}
                                {c.after.map((s) => `${s.name} ${sharePct(s.share)}`).join(", ")}
                            </div>
                        </li>
                    ))}
                </ol>
            ) : loadFailed(history) ? <LoadError error={history.error} retry={() => history.refetch()} what="the history" /> : <SkeletonLines lines={4} />}
        </Modal>
    );
}

/**
 * Which departments work on the project (project:edit). Any change puts the shares back to equal, and hours waiting for
 * an added department go through. A department with hours logged on the project stays.
 */
export function DepartmentsModal({ project, current, onClose }: { project: Project; current: number[]; onClose: () => void }) {
    const save = useSetDepartments(project.id);
    const errors = useFormErrors();
    const [chosen, setChosen] = useState<number[]>(current);
    const chosenError = chosen.length === 0 && "Choose at least one department.";
    const changed = chosen.length !== current.length || chosen.some((id) => !current.includes(id));

    function submit() {
        if (save.isPending) return;
        if (chosenError) return errors.tried();
        if (!changed) return onClose();
        save.mutate(chosen, {
            onSuccess: () => {
                toast({ text: "Departments saved", sub: `${project.title} · shares back to equal`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Departments" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error ? <FormFailure error={save.error} onForced={onClose} /> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <label className="label required">Departments working on it</label>
                <DepartmentPicker value={chosen} onChange={setChosen} />
                {errors.show("departments", chosenError) ? <FieldError message={errors.show("departments", chosenError)} />
                    : <div className="hint">Only their people log hours on it. A change puts the shares back to equal; hours waiting for an added department go through.</div>}
            </div>
        </Modal>
    );
}
