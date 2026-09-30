import type { IconName } from "@/shared/icons/icons";
import { fmtDate, fmtDayDate, fmtH, fmtTime, partsOf } from "@/shared/format/time";
import { dayKey } from "@/shared/format/time";
import { meetingTitle } from "../../../shared/meetings/meetingsApi";
import type { Annotation, ProjectEvent, StatusKey } from "./history";

/* The history's words, as the prototype puts them: what the entries show, never why. */

export const STATUS_WORD: Record<StatusKey, string> = { active: "Active", hold: "On hold", completed: "Completed", archived: "Archived" };

/** "Wed, Sep 30, 2026 · 9:30 AM". */
export const fmtMoment = (t: number) => `${fmtDayDate(t)}, ${partsOf(dayKey(t)).year} · ${fmtTime(t)}`;

export const firstName = (name: string) => name.split(" ")[0] || "Someone";

/** "Ana, Sam and Lee". */
export function list(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function statusChange(s: StatusKey, again: boolean): string {
    if (s === "active") return again ? "Reopened - active again" : "Project created";
    if (s === "hold") return "Put on hold";
    if (s === "completed") return "Marked completed";
    return "Archived";
}

export type SourceKind = "recorded" | "estimated" | "inferred" | "calculated";

/** An annotation as a chip: icon, words and where it comes from. */
export function annView(a: Annotation, nameOf: (id: number) => string): { icon: IconName; text: string; src: SourceKind } | null {
    switch (a.kind) {
        case "status": {
            const s = a.status!;
            return {
                icon: s === "hold" ? "pause" : s === "completed" ? "checkCircle" : s === "archived" ? "archive" : a.again ? "refresh" : "plus",
                text: statusChange(s, !!a.again) + (a.source === "recorded" && a.actorName ? ` · by ${a.actorName}` : ""),
                src: a.source === "recorded" ? "recorded" : "inferred",
            };
        }
        case "progress":
            return { icon: "trendUp", text: `Progress set to ${a.value}%${a.prev != null ? ` (was ${a.prev}%)` : ""}${a.actorName ? ` · by ${a.actorName}` : ""}`, src: "recorded" };
        case "joined":
            return { icon: "userPlus", text: `${firstName(nameOf(a.personId!))}'s first logged work on this project${a.role ? ` · ${a.role}` : ""}`, src: "inferred" };
        case "last_entry":
            return { icon: "user", text: `${firstName(nameOf(a.personId!))}'s last logged work on this project`, src: "inferred" };
        case "discipline_start":
            return { icon: "flag", text: `${a.role} work first appears`, src: "inferred" };
        case "discipline_end":
            return { icon: "flag", text: `${a.role} work last appears`, src: "inferred" };
        case "discipline_change":
            return { icon: "flag", text: `${a.roleFrom} work last appears · ${a.roleTo} work first appears ${fmtDate(a.endAt!)}`, src: "inferred" };
        case "peak_day":
            return { icon: "trendUp", text: `Busiest day of the project · ${fmtH(a.minutes!)} logged`, src: "calculated" };
        case "peak_overlap":
            return { icon: "people", text: `Most people working at the same time: ${a.n}`, src: "calculated" };
        case "meeting": {
            const m = a.meeting!;
            return { icon: "calendar", text: meetingTitle({ startsAt: new Date(m.start).toISOString() }) + (m.topic ? ` · ${m.topic}` : ""), src: "recorded" };
        }
        default:
            return null;
    }
}

const EVENT_TEXT: Record<string, string> = {
    project_created: "Project created",
    project_hold: "Put on hold",
    project_resumed: "Resumed",
    project_reopened: "Reopened",
    project_completed: "Marked completed",
    project_archived: "Archived",
};

export function eventText(e: ProjectEvent): string {
    if (e.kind === "progress_set") return `Progress set to ${e.amount}%`;
    return EVENT_TEXT[e.kind] ?? e.kind.replace(/_/g, " ");
}
