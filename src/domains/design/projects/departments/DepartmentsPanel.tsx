import { useState } from "react";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { loadFailed } from "@/api/queryState";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { Bar } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Avatar from "@/shared/components/Identity/Avatar";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtH } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../../shared/projects/projectsApi";
import { DepartmentPicker } from "./DepartmentPicker";
import {
    sharePct, useDepartmentHistory, useProjectDepartments, useSetDepartments, useSetShares,
    type DepartmentChange, type DepartmentMoney, type ProjectDepartment,
} from "./departmentsApi";

const REASON_MAX = 500;

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * "Departments" on a Design project's Financials tab: a card for each department with its share of the price, its
 * budget, what the hours logged in it cost and what's left (red when it's over), and who logged them.
 */
export default function DepartmentsPanel({ project, locked, onEditDepartments }: { project: Project; locked: boolean; onEditDepartments?: () => void }) {
    const permissions = usePermissions();
    const departments = useProjectDepartments(project.id);
    const [dialog, setDialog] = useState<"shares" | "history" | null>(null);
    const list = departments.data?.departments ?? [];
    const canShare = !locked && permissions.has(P.FINANCIAL_WRITE) && list.length >= 2;
    const edit = !locked ? onEditDepartments : undefined;

    return (
        <div className="panel mt" role="region" aria-label="Departments">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">
                        Departments{departments.data?.name && <span className="badge" style={{ marginLeft: 8 }}>{departments.data.name}</span>}
                    </div>
                    <div className="panel-sub">Each department's share of the payment before TVA, and what the hours logged in it cost. Expenses stay with the project.</div>
                </div>
                <div className="panel-tools">
                    {list.length > 0 && <button className="btn btn-sm" onClick={() => setDialog("history")}><Icon name="clock" />History</button>}
                    {canShare && <button className="btn btn-sm" onClick={() => setDialog("shares")}><Icon name="edit" />Edit shares</button>}
                    {edit && <button className="btn btn-sm" onClick={edit}><Icon name="people" />Change departments</button>}
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(departments) ? <LoadError error={departments.error} retry={() => departments.refetch()} what="the departments" />
                    : !departments.data ? <SkeletonLines lines={4} />
                        : list.length === 0 ? (
                            <div>
                                <p className="muted">No departments yet: the whole payment is one budget, and anyone in Design can log hours on it.</p>
                                {edit && <button className="btn btn-sm mt-s" onClick={edit}><Icon name="plus" />Choose departments</button>}
                            </div>
                        ) : (
                            <div className="dept-grid">
                                {list.map((d) => <DepartmentCard key={d.id} department={d} />)}
                                {departments.data.other && (
                                    <DepartmentCard department={{ id: 0, name: "Other hours", share: null, money: departments.data.other }}
                                        note="Logged by people in no department, or in one no longer on the project: in the project's cost, in no budget." />
                                )}
                            </div>
                        )}
            </div>
            {dialog === "shares" && <SharesModal project={project} departments={list} onClose={() => setDialog(null)} />}
            {dialog === "history" && <HistoryModal project={project} onClose={() => setDialog(null)} />}
        </div>
    );
}

function DepartmentCard({ department: d, note }: { department: ProjectDepartment; note?: string }) {
    const m = d.money as DepartmentMoney;
    const over = m.left < 0;
    const used = m.budget > 0 ? (m.cost / m.budget) * 100 : 0;
    return (
        <div className={cx("dept-card", over && "over")} role="group" aria-label={d.name}>
            <div className="dept-card-head">
                <span className="dept-card-name grow trunc">{d.name}</span>
                {d.share != null && <span className="badge">{sharePct(d.share)}</span>}
            </div>
            {note ? <div className="hint" style={{ marginBottom: 8 }}>{note}</div> : (
                <>
                    <div className="spread" style={{ fontSize: 12.5 }}>
                        <span className="muted">Budget</span><span className="mono">{money.fmt(m.budget)}</span>
                    </div>
                    <Bar value={used} tone={over ? "down" : undefined} hideValue />
                </>
            )}
            <div className="spread" style={{ fontSize: 12.5 }}>
                <span className="muted">Cost · {fmtH(m.minutes)}</span><span className="mono">{money.fmt(m.cost)}</span>
            </div>
            {!note && (
                <div className="spread" style={{ fontSize: 13, fontWeight: 650, marginTop: 2 }}>
                    <span>{over ? "Over budget" : "Left"}</span>
                    <span className={cx("mono money", over && "down")}>{money.fmt(over ? -m.left : m.left)}</span>
                </div>
            )}
            {m.people.length > 0 && (
                <div className="mt-s">
                    {m.people.map((p) => {
                        const last = p.months[p.months.length - 1];
                        return (
                            <div key={p.person.id} className="cost-row" title={p.months.map((x) =>
                                `${MONTH.format(new Date(x.month))}: ${fmtH(x.minutes)}${x.hourlyRate != null ? ` at ${money.exact(x.hourlyRate)}/h` : ""} · ${money.fmt(x.cost)}`).join("\n")}>
                                <Avatar person={{ name: p.person.name }} size={20} />
                                <span className="grow trunc">{p.person.name}</span>
                                <span className="muted" style={{ fontSize: 11.5 }}>
                                    {fmtH(p.minutes)}{last?.hourlyRate != null ? ` · ${money.exact(last.hourlyRate)}/h` : ""}
                                </span>
                                <span className="mono">{money.fmt(p.cost)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
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
    const reasonError = !reason.trim() ? "Say why the shares change." : reason.trim().length > REASON_MAX && `At most ${REASON_MAX} characters.`;

    function submit() {
        if (save.isPending) return;
        if (sharesError || reasonError || unchanged) return errors.tried();
        save.mutate({
            shares: values.map((v) => ({ departmentId: v.id, share: Math.round(v.pct * 100) / 10000 })),
            reason: reason.trim(),
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
                <label className="label required" htmlFor="share-why">Why they change</label>
                <AutoGrowTextarea id="share-why" className="input" minRows={2} maxRows={8} maxLength={REASON_MAX} value={reason}
                    placeholder="e.g. Structure needs less than planned." onChange={(e) => setReason(e.target.value)} onBlur={errors.touch("reason")} />
                <div className="hint">Kept in the departments' history.</div>
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
