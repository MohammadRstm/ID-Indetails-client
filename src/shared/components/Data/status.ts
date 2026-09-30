import type { IconName } from "@/shared/icons/icons";

/* How each project status is shown: its label, icon and badge class. */

export type ProjectStatusKey = "active" | "hold" | "completed" | "archived" | "invited";

export const PROJECT_STATUS: Record<ProjectStatusKey, { label: string; icon: IconName; cls: string }> = {
    active: { label: "Active", icon: "circleDot", cls: "badge-active" },
    hold: { label: "On hold", icon: "pause", cls: "badge-hold" },
    completed: { label: "Completed", icon: "checkCircle", cls: "badge-completed" },
    archived: { label: "Archived", icon: "archive", cls: "badge-archived" },
    invited: { label: "Invited", icon: "send", cls: "badge-invited" },
};
