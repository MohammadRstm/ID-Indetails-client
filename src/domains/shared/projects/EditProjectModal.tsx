import { useState, type FormEvent } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { companyToday } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { useUpdateProject, type Project } from "./projectsApi";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillChange, useProtonForm } from "@/domains/shared/proton/formFill";

/** A project's details (project:edit): its name, description, where it is, when it started and when it should be done. */
export default function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const update = useUpdateProject(project.id);
    const errors = useFormErrors();
    const [title, setTitle] = useState(project.title);
    const [description, setDescription] = useState(project.description ?? "");
    const [location, setLocation] = useState(project.location ?? "");
    const [target, setTarget] = useState(project.targetDate ?? "");
    const [start, setStart] = useState(project.startDate);
    const today = companyToday();
    const proton = useProtonForm("edit_project", project.id, (fill) => {
        const v = fill.editProject;
        const done: string[] = [];
        if (!v) return done;
        // the person asked for these changes: each shows what it was until they save
        fillChange(title, v.title, setTitle, "name", done);
        fillChange(description, v.description, setDescription, "description", done);
        fillChange(location, v.location, setLocation, "location", done);
        fillChange(target, v.targetDate, setTarget, "target date", done);
        return done;
    });
    const titleError = title.trim() === "" && "Give the project a name.";
    const startError = !start ? "Pick the day the project started." : start > today && "The start date can't be in the future.";
    // the API also refuses a site's start after its first ground labour: shown beside the field until it is changed
    const startRefused = toApiError(update.error).fieldErrors.startDate;

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (update.isPending) return;
        if (titleError || startError) {
            errors.tried();
            return;
        }
        // the API replaces the details, so everything this form doesn't change goes back as it was
        update.mutateAsync({
            title: title.trim(), description: description.trim() || null, location: location.trim() || null,
            icon: project.icon, tint: project.tint, targetDate: target || null, startDate: start, ownerId: project.owner.id,
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
                    <div className="grow">{update.error && !startRefused ? <FieldError message={errorMessage(update.error)} /> : null}</div>
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
