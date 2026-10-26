import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useChangeProjectStatus, type BoxChoice, type Project } from "../../shared/projects/projectsApi";
import { closeOptions, REOPEN_OPTIONS, type BoxOption } from "./boxApi";

/** Radio cards for what happens to a project's money in the Execution box. */
export function BoxOptions({ options, value, onChange }: { options: BoxOption[]; value: BoxChoice; onChange: (v: BoxChoice) => void }) {
    return (
        <div role="radiogroup" aria-label="The Execution box" className="stack" style={{ gap: 6 }}>
            {options.map((o) => (
                <label key={o.value} className={cx("choice-card", value === o.value && "on")}>
                    <input type="radio" name="box-choice" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
                    <span>
                        <b>{o.title}</b>
                        <span className="muted" style={{ display: "block", fontSize: "11.5px" }}>{o.text}</span>
                    </span>
                </label>
            ))}
        </div>
    );
}

/**
 * Archiving an open Execution site, or reopening one whose revenue was removed, asks first what happens to its money
 * in the Execution box. Completing asks inside the close-out review instead.
 */
export default function BoxChoiceModal({ project, action, onClose }: { project: Project; action: "archive" | "reopen"; onClose: () => void }) {
    const change = useChangeProjectStatus(project.id);
    const archive = action === "archive";
    const options = archive ? closeOptions(project) : REOPEN_OPTIONS;
    const [box, setBox] = useState<BoxChoice>(options[0].value);

    function confirm() {
        change.mutate({ action, box }, {
            onSuccess: () => {
                toast({ text: `${project.title} is ${archive ? "now archived" : "active again"}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" onClose={onClose} title={archive ? `Archive ${project.title}` : `Reopen ${project.title}`}
            sub={archive ? "Archiving closes the site. What happens to its money in the Execution box?" : "Its revenue was removed from the Execution box when it closed."}
            foot={
                <>
                    <div className="grow">{change.error && <FieldError message={errorMessage(change.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={change.isPending} onClick={confirm}>
                        <Icon name={archive ? "archive" : "refresh"} />{archive ? "Archive project" : "Reopen project"}
                    </button>
                </>
            }>
            <BoxOptions options={options} value={box} onChange={setBox} />
        </Modal>
    );
}
