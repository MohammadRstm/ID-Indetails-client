import { quarterEnd, quarterLabel, quarterOf, quarterStart } from "@/shared/format/periods";
import { addDays, dayKey } from "@/shared/format/time";
import type { Project } from "../../shared/projects/projectsApi";
import type { WorkRange } from "./ContributorDrawer";

export type RangeKey = "all" | "quarter" | "d30" | "d7";

/** The stretches a project's work can be looked at over: all of it, this quarter, the last 30 or 7 days. */
export function rangeOptions(project: Project, today: string): Record<RangeKey, WorkRange> {
    const q = quarterOf(today);
    return {
        all: { label: "Entire project", from: project.startDate, to: project.completedAt ? dayKey(project.completedAt) : today },
        quarter: { label: quarterLabel(q.year, q.quarter), from: quarterStart(q.year, q.quarter), to: quarterEnd(q.year, q.quarter) },
        d30: { label: "Last 30 days", from: addDays(today, -29), to: today },
        d7: { label: "Last 7 days", from: addDays(today, -6), to: today },
    };
}
