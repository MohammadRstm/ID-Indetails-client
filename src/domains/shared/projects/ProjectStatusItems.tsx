import { errorMessage } from "@/api/errors";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { actionFor, useChangeProjectStatus, type ProjectStatus } from "./projectsApi";

const ORDER: ProjectStatus[] = ["active", "hold", "completed", "archived"];

type ProjectStatusItemsProps = {
    project: { id: number; title: string; status: ProjectStatus };
    close: () => void;
    /** Completing asks first (the close-out review); the menu hands that over. */
    onComplete?: () => void;
};

/**
 * The "Set status" part of a project menu. Each status the API can move the project to is offered; the
 * others are shown disabled.
 */
export default function ProjectStatusItems({ project, close, onComplete }: ProjectStatusItemsProps) {
    const change = useChangeProjectStatus(project.id);

    function pick(to: ProjectStatus) {
        close();
        const action = actionFor(project.status, to);
        if (!action) return;
        if (action === "complete" && onComplete) {
            onComplete();
            return;
        }
        change.mutate(action, {
            onSuccess: () => toast({ text: `${project.title} is now ${PROJECT_STATUS[to].label.toLowerCase()}`, icon: "checkCircle" }),
            onError: (error) => toast({ text: "The status didn't change", sub: errorMessage(error), icon: "alert" }),
        });
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
