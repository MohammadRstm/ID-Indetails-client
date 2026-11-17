import { useState, type FormEvent } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { WHOLE_AMOUNT } from "@/shared/format/limits";
import { companyToday } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { useUpdateProject, type Project } from "./projectsApi";
import ProjectCodeFields from "./ProjectCodeFields";
import { buildingCodeError, projectCodeError, typedCode } from "./projectCodes";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillChange, useProtonForm } from "@/domains/shared/proton/formFill";

/** A project's details (project:edit): its name and codes, description, where it is, when it started and when it should be done. */
export default function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const update = useUpdateProject(project.id);
    const errors = useFormErrors();
    const [title, setTitle] = useState(project.title);
    const [projectCode, setProjectCode] = useState(project.projectCode);
    const [buildingCode, setBuildingCode] = useState(project.buildingCode);
    const [description, setDescription] = useState(project.description ?? "");
    const [location, setLocation] = useState(project.location ?? "");
    const [target, setTarget] = useState(project.targetDate ?? "");
    const [start, setStart] = useState(project.startDate);
    // a reference price in CFA francs: only whoever sees the money sees or sets it; the others' save leaves it out, and it stays
    const seesMoney = usePermissions().has(P.FINANCIAL_VIEW);
    const [cfaPrice, setCfaPrice] = useState(project.money?.cfaPrice ?? 0);
    const today = companyToday();
    const proton = useProtonForm("edit_project", project.id, (fill) => {
        const v = fill.editProject;
        const done: string[] = [];
        if (!v) return done;
        // the person asked for these changes: each shows what it was until they save
        fillChange(title, v.title, setTitle, "name", done);
        fillChange(projectCode, v.projectCode && typedCode(v.projectCode), setProjectCode, "project code", done);
        fillChange(buildingCode, v.buildingCode && typedCode(v.buildingCode), setBuildingCode, "building code", done);
        fillChange(description, v.description, setDescription, "description", done);
        fillChange(location, v.location, setLocation, "location", done);
        fillChange(target, v.targetDate, setTarget, "target date", done);
        return done;
    });
    const titleError = title.trim() === "" && "Give the project a name.";
    const codeError = projectCodeError(projectCode);
    const buildingError = buildingCodeError(buildingCode);
    const startError = !start ? "Pick the day the project started." : start > today && "The start date can't be in the future.";
    // the API also refuses a site's start after its first ground labour: shown beside the field until it is changed
    const failure = toApiError(update.error);
    const startRefused = failure.fieldErrors.startDate;
    // so is a code another project has taken since
    const codeRefused = failure.code === "project_code_taken" ? failure.message : failure.fieldErrors.projectCode;

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (update.isPending) return;
        if (titleError || codeError || buildingError || startError) {
            errors.tried();
            return;
        }
        // the API replaces the details, so everything this form doesn't change goes back as it was
        update.mutateAsync({
            title: title.trim(), projectCode, buildingCode, description: description.trim() || null, location: location.trim() || null,
            icon: project.icon, tint: project.tint, targetDate: target || null, startDate: start, ownerId: project.owner.id,
            // 0 clears it
            ...(seesMoney ? { cfaPrice } : {}),
        }).then(
            () => {
                toast({ text: `${title.trim()} updated`, icon: "checkCircle" });
                onClose();
            },
            () => undefined, // shown in the foot
        );
    }

    return (
        <Modal surfaceId="edit_project" title="Edit project details" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{update.error && !startRefused && !codeRefused ? <FieldError message={errorMessage(update.error)} /> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={update.isPending} onClick={() => submit()}>{update.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div {...proton.guard}>
                <FilledNote fields={proton.filled} />
                <form onSubmit={submit}>
                    <div className="field">
                        <label className="label required" htmlFor="ep-title">Project name</label>
                        <input id="ep-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={errors.touch("title")} />
                        <FieldError message={errors.show("title", titleError)} />
                    </div>
                    <ProjectCodeFields domain={project.domain} projectId={project.id} projectCode={projectCode} buildingCode={buildingCode}
                        onProjectCode={(code) => { if (update.error) update.reset(); setProjectCode(code); }} onBuildingCode={setBuildingCode}
                        projectCodeError={codeError} buildingCodeError={buildingError} refused={codeRefused} errors={errors} />
                    <div className="field mt">
                        <label className="label" htmlFor="ep-desc">Description</label>
                        <textarea id="ep-desc" className="textarea" style={{ minHeight: 60 }} placeholder="Optional - what is this project about?"
                            value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="grid g-2 mt">
                        <div className="field">
                            <label className="label" htmlFor="ep-location">Location</label>
                            <input id="ep-location" className="input" maxLength={200} placeholder={`Optional - e.g. ${project.domain === "execution" ? "Achrafieh, Beirut" : "Broummana, Mount Lebanon"}`}
                                value={location} onChange={(e) => setLocation(e.target.value)} />
                        </div>
                        {seesMoney && (
                            <div className="field">
                                <label className="label optional" htmlFor="ep-cfa">CFA price</label>
                                <AmountField id="ep-cfa" value={cfaPrice || null} currency="CFA" currencies={false} shape={WHOLE_AMOUNT} onChange={setCfaPrice} />
                                <div className="hint">For reference - it is in no calculation.</div>
                            </div>
                        )}
                    </div>
                    <div className="grid g-2 mt">
                        <div className="field">
                            <label className="label required" htmlFor="ep-start">Start date</label>
                            <DateInput id="ep-start" className="input mono" value={start} max={today}
                                onChange={(v) => { if (update.error) update.reset(); setStart(v); errors.touch("start")(); }} />
                            <FieldError message={errors.show("start", startError) ?? startRefused} />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="ep-target">Target completion</label>
                            <DateInput id="ep-target" className="input mono" value={target} placeholder="Optional" onChange={setTarget} />
                        </div>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
