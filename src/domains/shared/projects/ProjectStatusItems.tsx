import { errorMessage } from "@/api/errors";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { actionFor, useChangeProjectStatus, type ProjectStatus, type StatusAction } from "./projectsApi";

const ORDER: ProjectStatus[] = ["active", "hold", "completed", "archived"];

type ProjectStatusItemsProps = {
    project: { id: number; title: string; status: ProjectStatus };
    close: () => void;
    /** Completing asks first (the close-out review); the menu hands that over. */
    onComplete?: () => void;
    /** Returns true when the change asks something first (an Execution site's box), which the caller then does. */
    asksFirst?: (action: StatusAction) => boolean;
};

/**
 * The "Set status" part of a project menu. Each status the API can move the project to is offered; the
 * others are shown disabled.
 */
export default function ProjectStatusItems({ project, close, onComplete, asksFirst }: ProjectStatusItemsProps) {
    const change = useChangeProjectStatus(project.id);

    function pick(to: ProjectStatus) {
        close();
        const action = actionFor(project.status, to);
        if (!action) return;
        if (action === "complete" && onComplete) {
            onComplete();
            return;
        }
        if (asksFirst?.(action)) return;
        // the menu has closed, so its per-call callbacks would never run; the promise still settles
        change.mutateAsync(action).then(
            () => toast({ text: `${project.title} is now ${PROJECT_STATUS[to].label.toLowerCase()}`, icon: "checkCircle" }),
            (error: unknown) => toast({ text: "The status didn't change", sub: errorMessage(error), icon: "alert" }),
        );
    }

    return (
        <>
            <div className="pop-label">Set status</div>
            {ORDER.map((s) => {
                const allowed = s === project.status || actionFor(project.status, s) != null;
                return (
                    <button key={s} className={cx("pop-item", project.status === s && "on")} disabled={!allowed || s === project.status}
                        onClick={() => pick(s)}>
                        <Icon name={PROJECT_STATUS[s].icon} />{PROJECT_STATUS[s].label}
                    </button>
                );
            })}
        </>
    );
}
