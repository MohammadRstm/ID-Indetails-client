import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import contributorJson from "./project/contributor.json";
import employeeJson from "./project/employee.json";
import entryJson from "./project/entry.json";
import latestJson from "./project/latest.json";
import projectJson from "./project/project.json";
import timelineJson from "./project/timeline.json";
import timelineEntriesJson from "./project/timelineEntries.json";
import workJson from "./project/work.json";

/*
 * A Design project as its admin sees it, captured from the seeded development API: Villa Mounir interiors,
 * its work, one contributor (Sarah, in the Interiors team), its timeline and one of her entries.
 */

export const projectWork = {
    project: projectJson as unknown as Schemas["ProjectResponse"],
    work: workJson as unknown as Schemas["ProjectWorkResponse"],
    contributor: contributorJson as unknown as Schemas["ProjectContributorDetailResponse"],
    timeline: timelineJson as unknown as Schemas["ProjectTimelineResponse"],
    timelineEntries: timelineEntriesJson as unknown as Schemas["TimelineEntryResponse"][],
    latest: latestJson as unknown as Paged<Schemas["WorkEntryResponse"]>,
    entry: entryJson as unknown as Schemas["WorkEntryDetailResponse"],
    employee: employeeJson as unknown as Schemas["EmployeeResponse"],
};

export const projectWorkHandlers = [
    http.get("/api/projects/totals", () => HttpResponse.json({})),
    http.get("/api/projects/:id", () => HttpResponse.json(projectWork.project)),
    http.get("/api/projects/:id/work", () => HttpResponse.json(projectWork.work)),
    http.get("/api/projects/:id/work/people/:userId", () => HttpResponse.json(projectWork.contributor)),
    http.get("/api/projects/:id/timeline", () => HttpResponse.json(projectWork.timeline)),
    http.get("/api/projects/:id/timeline/entries", () => HttpResponse.json(projectWork.timelineEntries)),
    http.get("/api/projects/:id/requirements", () => HttpResponse.json({ items: [], total: 0, done: 0, overdue: 0, progressPct: 0 })),
    http.get("/api/projects/:id/meetings", () => HttpResponse.json([])),
    http.get("/api/work-entries", () => HttpResponse.json(projectWork.latest)),
    http.get("/api/work-entries/:id", () => HttpResponse.json(projectWork.entry)),
    http.get("/api/work-entries/:id/comments", () => HttpResponse.json(projectWork.entry.comments)),
    http.get("/api/employees/:id", () => HttpResponse.json(projectWork.employee)),
    http.get("/api/employees", () => HttpResponse.json({ items: [], page: 1, pageSize: 100, totalCount: 0 })),
];
