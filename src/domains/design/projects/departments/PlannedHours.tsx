import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Bar } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtH } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import {
    plannedHoursError, plannedHoursText, useProjectDepartments, useSetDepartmentPlan, type ProjectDepartment,
} from "./departmentsApi";

type Planned = Pick<ProjectDepartment, "plannedMinutes" | "loggedMinutes" | "progress">;

/**
 * A department's planned hours: "50h of 40h" with a bar of the API's progress for whoever sees the hours logged in
 * it (amber once more is logged than planned), the planned hours alone for everyone else, a dash with no plan.
 */
export function PlannedHoursCell({ department: d }: { department: Planned }) {
    if (d.plannedMinutes == null) return <span className="muted">-</span>;
    if (d.loggedMinutes == null || d.progress == null) return <span className="mono">{fmtH(d.plannedMinutes)}</span>;
    return (
        <div>
            <div className="mono" style={{ fontSize: 12 }}>{fmtH(d.loggedMinutes)} of {fmtH(d.plannedMinutes)}</div>
            <Bar value={d.progress * 100} tone={d.progress > 1 ? "warn" : undefined} />
        </div>
    );
}

/**
 * "Planned hours" on a Design project's Overview, for whoever doesn't see its Financials: each department's planned
 * hours, and how far along they are for those who see the hours logged. Hidden on a project with no departments, and
 * while none is planned for someone who can't plan them.
 */
export function PlannedHoursPanel({ project }: { project: Project }) {
    const permissions = usePermissions();
    const hasDepartments = (project.departments?.length ?? 0) > 0;
    const departments = useProjectDepartments(project.id, hasDepartments);
    const [planning, setPlanning] = useState(false);
    const list = departments.data?.departments ?? [];
    const canPlan = permissions.has(P.PROJECT_EDIT);
    if (!hasDepartments) return null;
    if (departments.data && !canPlan && list.every((d) => d.plannedMinutes == null)) return null;

    return (
        <div className="panel mt" role="region" aria-label="Planned hours">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Planned hours</div>
                    <div className="panel-sub">The hours each department is expected to put into the project.</div>
                </div>
                {canPlan && list.length > 0 && (
                    <div className="panel-tools">
                        <button className="btn btn-sm" onClick={() => setPlanning(true)}><Icon name="clock" />Plan hours</button>
                    </div>
                )}
            </div>
            {loadFailed(departments) ? <div className="panel-body"><LoadError error={departments.error} retry={() => departments.refetch()} what="the departments" /></div>
                : !departments.data ? <div className="panel-body"><SkeletonLines lines={3} /></div>
                    : (
                        <div className="tbl-wrap">
                            <table className="tbl" aria-label="Planned hours by department">
                                <thead>
                                    <tr>
                                        <th>Department</th>
                                        <th style={{ width: 180 }}>Planned hours</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map((d) => (
                                        <tr key={d.id} aria-label={d.name}>
                                            <td><div className="dept-name">{d.name}</div></td>
                                            <td><PlannedHoursCell department={d} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            {planning && <PlanHoursModal project={project} departments={list} onClose={() => setPlanning(false)} />}
        </div>
    );
}

/** The hours as typed, as the API takes them: empty clears the plan. */
const hoursOf = (text: string) => (text.trim() ? Number(text.trim()) : null);

/**
 * The hours planned for each department (project:edit), one field each, starting at its plan now; an emptied field
 * clears it. Only the departments changed are sent, so the others keep theirs. What the API refuses shows beside its
 * field until it is changed.
 */
export function PlanHoursModal({ project, departments, onClose }: { project: Project; departments: ProjectDepartment[]; onClose: () => void }) {
    const save = useSetDepartmentPlan(project.id);
    const errors = useFormErrors();
    const [typed, setTyped] = useState<Record<number, string>>(
        () => Object.fromEntries(departments.map((d) => [d.id, plannedHoursText(d.plannedMinutes)])));
    // the departments sent, in order, so a refusal of departments[i] shows beside its field
    const [sent, setSent] = useState<number[]>([]);
    const refused = toApiError(save.error);
    const textOf = (d: ProjectDepartment) => typed[d.id] ?? "";
    const changed = departments.filter((d) => hoursOf(textOf(d)) !== hoursOf(plannedHoursText(d.plannedMinutes)));
    const invalid = departments.some((d) => plannedHoursError(textOf(d)));
    const unchangedError = changed.length === 0 && "The planned hours are already these: change one of them.";
    const fieldRefused = (d: ProjectDepartment) => {
        const i = sent.indexOf(d.id);
        return i < 0 ? undefined : refused.fieldErrors[`departments[${i}].plannedHours`] ?? refused.fieldErrors[`departments[${i}].teamId`]
            ?? refused.fieldErrors[`departments[${i}]`];
    };
    // the foot has the failure only when no field is what the API named
    const anyFieldRefused = refused.fieldErrors.departments ?? departments.map(fieldRefused).find((m) => m != null);

    function edit(id: number, text: string) {
        if (save.error) save.reset();
        setTyped((t) => ({ ...t, [id]: text }));
    }

    function submit() {
        if (save.isPending) return;
        if (invalid || unchangedError) return errors.tried();
        setSent(changed.map((d) => d.id));
        save.mutate({ departments: changed.map((d) => ({ teamId: d.id, plannedHours: hoursOf(textOf(d)) })) }, {
            onSuccess: () => {
                toast({ text: "Planned hours saved", sub: project.title, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Planned hours" sub={project.title} onClose={save.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {save.error && !anyFieldRefused ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(save.error)}</span>
                            : "Hours, not money: kept apart from the departments' budgets."}
                    </div>
                    <button className="btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="hint" style={{ marginBottom: 10 }}>The hours each department is expected to log on the project. Leave one empty for no plan.</div>
            {departments.map((d) => (
                <div key={d.id} className="field">
                    <div className="row" style={{ gap: 10, alignItems: "center" }}>
                        <label className="label grow" htmlFor={`plan-${d.id}`} style={{ margin: 0 }}>{d.name}</label>
                        <input id={`plan-${d.id}`} className="input mono" style={{ width: 120, textAlign: "right" }} inputMode="decimal"
                            value={textOf(d)} placeholder="No plan" onChange={(e) => edit(d.id, e.target.value)} onBlur={errors.touch(`plan-${d.id}`)} />
                        <span className="muted">h</span>
                    </div>
                    <FieldError message={errors.show(`plan-${d.id}`, plannedHoursError(textOf(d))) ?? fieldRefused(d)} />
                </div>
            ))}
            <FieldError message={errors.show("plan", !invalid && unchangedError) ?? refused.fieldErrors.departments} />
        </Modal>
    );
}
