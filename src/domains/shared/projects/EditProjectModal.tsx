import { useState, type FormEvent } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { useUpdateProject, type Project } from "./projectsApi";

/** A project's details (project:edit): its name, description, where it is and when it should be done. */
export default function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const update = useUpdateProject(project.id);
    const errors = useFormErrors();
    const [title, setTitle] = useState(project.title);
    const [description, setDescription] = useState(project.description ?? "");
    const [location, setLocation] = useState(project.location ?? "");
    const [target, setTarget] = useState(project.targetDate ?? "");
    const titleError = title.trim() === "" && "Give the project a name.";

    function submit(e?: FormEvent) {
        e?.preventDefault();
        if (update.isPending) return;
        if (titleError) {
            errors.tried();
            return;
        }
        // the API replaces the details, so everything this form doesn't change goes back as it was
        update.mutateAsync({
            title: title.trim(), description: description.trim() || null, location: location.trim() || null,
            icon: project.icon, tint: project.tint, targetDate: target || null, ownerId: project.owner.id,
        }).then(
            () => {
                toast({ text: `${title.trim()} updated`, icon: "checkCircle" });
                onClose();
            },
            () => undefined, // shown in the foot
        );
    }

    return (
        <Modal title="Edit project details" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{update.error ? <FieldError message={errorMessage(update.error)} /> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={update.isPending} onClick={() => submit()}>{update.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
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
                    <div className="field">
                        <label className="label" htmlFor="ep-target">Target completion</label>
                        <DateInput id="ep-target" className="input mono" value={target} placeholder="Optional" onChange={setTarget} />
                    </div>
                </div>
            </form>
        </Modal>
    );
}
