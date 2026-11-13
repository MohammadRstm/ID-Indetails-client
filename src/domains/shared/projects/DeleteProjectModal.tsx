import { useState } from "react";
import { useNavigate } from "react-router";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { useDeleteProject, useProjectDeletion, type Project } from "./projectsApi";

/**
 * Deleting an archived project made by mistake (project:delete). It first says what goes with it, or why it can't be
 * deleted: a project that was invoiced, paid or had hours logged stays archived for good. The project's name, typed
 * exactly, confirms it.
 */
export default function DeleteProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const navigate = useNavigate();
    const deletion = useProjectDeletion(project.id);
    const remove = useDeleteProject(project.id);
    const [typed, setTyped] = useState("");
    const d = deletion.data;
    const named = typed.trim() === project.title.trim();

    function confirm() {
        if (!d?.canDelete || !named) return;
        remove.mutate(typed, {
            onSuccess: () => {
                toast({ text: `${project.title} deleted`, sub: "With everything on it", icon: "trash" });
                onClose();
                navigate(`/${project.domain}/projects`, { replace: true });
            },
        });
    }

    return (
        <Modal size="sm" title={`Delete ${project.title}?`} onClose={remove.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{remove.error != null && <span className="err"><Icon name="alert" /><ErrorMessage error={remove.error} /></span>}</div>
                    <button className="btn" disabled={remove.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={!d?.canDelete || !named || remove.isPending} onClick={confirm}>
                        <Icon name="trash" />{remove.isPending ? "Deleting…" : "Delete project"}
                    </button>
                </>
            }>
            {loadFailed(deletion) ? <LoadError error={deletion.error} retry={() => deletion.refetch()} what="what deleting it would remove" />
                : !d ? <SkeletonLines lines={4} />
                    : !d.canDelete ? (
                        <div className="banner attn" role="alert">
                            <Icon name="lock" />
                            <div className="grow">
                                <b>This project can't be deleted.</b> Only a project made by mistake can, and this one holds something real, so it stays archived:
                                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{d.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="banner attn">
                                <Icon name="alert" />
                                <div className="grow">
                                    <b>This can't be undone.</b> Delete a project only when it was made by mistake. {d.removes.length > 0 ? "These go with it:" : "Nothing else is on it."}
                                    {d.removes.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }} aria-label="What goes with it">{d.removes.map((r) => <li key={r}>{r}</li>)}</ul>}
                                </div>
                            </div>
                            <p className="muted" style={{ margin: "12px 0 6px", fontSize: 12.5 }}>The client and the people stay. One line in the activity says who deleted it.</p>
                            <div className="field">
                                <label className="label" htmlFor="delete-project-name">Type <b>{project.title}</b> to confirm</label>
                                <input id="delete-project-name" className="input" placeholder="Enter project name" autoComplete="off" spellCheck={false}
                                    value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirm(); }} />
                                <FieldError message={typed.trim() && !named ? "That isn't the project's name." : undefined} />
                            </div>
                        </>
                    )}
        </Modal>
    );
}
