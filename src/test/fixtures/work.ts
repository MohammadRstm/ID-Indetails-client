import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import dayJson from "./work/day.json";
import hoursJson from "./work/hours.json";
import myProjectsJson from "./work/myProjects.json";
import overtimeJson from "./work/overtime.json";
import previewJson from "./work/preview.json";
import projectJson from "./work/project.json";
import projectWorkJson from "./work/projectWork.json";
import scheduleJson from "./work/schedule.json";
import settingsJson from "./work/settings.json";
import summaryJson from "./work/summary.json";

/*
 * A Design employee's own work, captured from the seeded development API as Sarah: her projects, her
 * Monday 28 September 2026 (five entries, 9:10 AM to 6 PM), that day's schedule and the domain settings.
 */

export const work = {
    myProjects: myProjectsJson as unknown as Schemas["MyProjectResponse"][],
    summary: summaryJson as unknown as Schemas["WorkSummaryResponse"],
    day: dayJson as unknown as Schemas["MyDayResponse"],
    schedule: scheduleJson as unknown as Schemas["MyScheduleResponse"],
    overtime: overtimeJson as unknown as Schemas["MyOvertimeResponse"],
    settings: settingsJson as unknown as Schemas["DomainSettingsResponse"],
    projectWork: projectWorkJson as unknown as Schemas["MyProjectWorkResponse"],
    project: projectJson as unknown as Schemas["ProjectResponse"],
    hours: hoursJson as unknown as Schemas["MyHoursResponse"],
    preview: previewJson as unknown as Schemas["OvertimePreviewResponse"],
};

/** The fixture's day, or an empty one for any other date. */
const dayOf = (date: string | null) => (date === work.day.date ? work.day : { ...work.day, date, entries: [], meetings: [], loggedMinutes: 0, overtimeMinutes: 0 });

export const workHandlers = [
    http.get("/api/me/projects", () => HttpResponse.json(work.myProjects)),
    http.get("/api/me/projects/:id/work", () => HttpResponse.json(work.projectWork)),
    http.get("/api/me/work-summary", () => HttpResponse.json(work.summary)),
    http.get("/api/me/day", ({ request }) => HttpResponse.json(dayOf(new URL(request.url).searchParams.get("date")))),
    http.get("/api/me/schedule", ({ request }) => {
        const date = new URL(request.url).searchParams.get("date");
        return HttpResponse.json({ ...work.schedule, day: { ...work.schedule.day, date } });
    }),
    http.get("/api/me/overtime", () => HttpResponse.json(work.overtime)),
    http.get("/api/me/hours", () => HttpResponse.json(work.hours)),
    http.post("/api/me/overtime-preview", () => HttpResponse.json(work.preview)),
    http.get("/api/domain-settings/:domain", () => HttpResponse.json(work.settings)),
    http.get("/api/projects/:id", () => HttpResponse.json(work.project)),
    http.get("/api/projects/:id/requirements", () => HttpResponse.json({ items: [], total: 0, done: 0, overdue: 0, progressPct: 0 })),
    http.get("/api/projects/:id/meetings", () => HttpResponse.json([])),
];
