import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import contributorJson from "./project/contributor.json";
import costTimelineJson from "./project/costTimeline.json";
import employeeJson from "./project/employee.json";
import entryJson from "./project/entry.json";
import expensesJson from "./project/expenses.json";
import latestJson from "./project/latest.json";
import projectJson from "./project/project.json";
import timelineJson from "./project/timeline.json";
import timelineEntriesJson from "./project/timelineEntries.json";
import workJson from "./project/work.json";
import teamsJson from "./people/teams.json";

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
    expenses: expensesJson as unknown as Schemas["ExpenseListResponse"],
    costTimeline: costTimelineJson as unknown as Schemas["ProjectCostTimelineResponse"],
    /** Its departments as whoever sees the money reads them: Architecture over its budget, Interiors well within. */
    departments: {
        name: null,
        departments: [
            {
                id: 12, name: "Architecture", share: 0.6,
                money: {
                    budget: 6000, cost: 6500, left: -500, minutes: 3000,
                    people: [{
                        person: { id: 9, name: "Yara Mansour" }, minutes: 3000, cost: 6500,
                        months: [{ month: "2026-08-01", minutes: 1200, hourlyRate: 12.5, cost: 2500 }, { month: "2026-09-01", minutes: 1800, hourlyRate: 13.25, cost: 4000 }],
                    }],
                },
            },
            { id: 13, name: "Interiors", share: 0.4, money: { budget: 4000, cost: 1000, left: 3000, minutes: 480, people: [] } },
        ],
        other: null,
    } as Schemas["ProjectDepartmentsResponse"],
    teams: teamsJson as unknown as Schemas["TeamResponse"][],
    /** Its variation orders, newest first: one waiting for the client, one already in the price. */
    designVos: [
        {
            id: 22, projectId: 1, number: "VO-2026-002", title: "Pool house", status: "pending", split: "shares",
            lines: [{ id: 5, description: "Pool house design", amount: 4000 }],
            allocations: [], totalUsd: 4000, tvaRate: 0.11, tvaUsd: 440, totalWithTvaUsd: 4440,
            outsideScopeMinutes: null, outsideScopeFrom: null,
            createdBy: { id: 1, name: "Rana Saab" }, createdAt: "2026-09-28T09:00:00Z",
            sentBy: { id: 1, name: "Rana Saab" }, sentAt: "2026-09-28T09:00:00Z",
            appliedBy: null, appliedAt: null, cancelledBy: null, cancelledAt: null,
        },
        {
            id: 21, projectId: 1, number: "VO-2026-001", title: "Guest house", status: "applied", split: "departments",
            lines: [{ id: 3, description: "Guest house design", amount: 9000 }, { id: 4, description: "No pergola", amount: -1000 }],
            allocations: [{ departmentId: 12, name: "Architecture", amount: 8000 }], totalUsd: 8000, tvaRate: 0.11, tvaUsd: 880, totalWithTvaUsd: 8880,
            outsideScopeMinutes: 150, outsideScopeFrom: "2026-09-01",
            createdBy: { id: 1, name: "Rana Saab" }, createdAt: "2026-09-10T09:00:00Z",
            sentBy: null, sentAt: null,
            appliedBy: { id: 1, name: "Rana Saab" }, appliedAt: "2026-09-10T09:00:00Z", cancelledBy: null, cancelledAt: null,
        },
    ] as Schemas["DesignVoResponse"][],
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
    http.get("/api/projects/:id/expenses", () => HttpResponse.json(projectWork.expenses)),
    http.get("/api/projects/:id/cost-timeline", () => HttpResponse.json(projectWork.costTimeline)),
    http.get("/api/projects/:id/departments", () => HttpResponse.json(projectWork.departments)),
    http.get("/api/projects/:id/departments/history", () => HttpResponse.json([])),
    http.get("/api/projects/:id/design-vos", () => HttpResponse.json(projectWork.designVos)),
    http.get("/api/projects/:id/design-vos/outside-scope", () => HttpResponse.json({ from: "2026-09-10", minutes: 150 })),
    // the departments to choose from
    http.get("/api/teams", () => HttpResponse.json(projectWork.teams)),
    // the customer payment's history
    http.get("/api/activity", () => HttpResponse.json({ items: [], page: 1, pageSize: 40, totalCount: 0 })),
];
