import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import clientJson from "./client.json";
import clientOverviewJson from "./clientOverview.json";
import clientsJson from "./clients.json";
import financeClientsJson from "./financeClients.json";
import financeSummaryJson from "./financeSummary.json";
import meetingsJson from "./meetings.json";
import projectJson from "./project.json";
import projectMeetingsJson from "./projectMeetings.json";
import projectsJson from "./projects.json";
import projectTotalsJson from "./projectTotals.json";
import requirementsJson from "./requirements.json";
import searchJson from "./search.json";

/*
 * Real API responses, captured from the seeded development database (scripts/seed-dev.mjs), so the mocks
 * keep the API's exact shape. Tests copy and change them rather than editing these.
 */

export const fixtures = {
    projects: projectsJson as unknown as Paged<Schemas["ProjectSummaryResponse"]>,
    projectTotals: projectTotalsJson as unknown as Schemas["ProjectListTotalsResponse"],
    project: projectJson as unknown as Schemas["ProjectResponse"],
    requirements: requirementsJson as unknown as Schemas["RequirementListResponse"],
    projectMeetings: projectMeetingsJson as unknown as Schemas["MeetingResponse"][],
    meetings: meetingsJson as unknown as Schemas["MeetingResponse"][],
    client: clientJson as unknown as Schemas["ClientResponse"],
    clients: clientsJson as unknown as Paged<Schemas["ClientSummaryResponse"]>,
    clientOverview: clientOverviewJson as unknown as Schemas["ClientOverviewResponse"],
    search: searchJson as unknown as Schemas["SearchResponse"],
    financeSummary: financeSummaryJson as unknown as Schemas["FinanceSummaryResponse"],
    financeClients: financeClientsJson as unknown as Schemas["FinanceClientResponse"][],
};

const empty = { items: [], page: 1, pageSize: 50, totalCount: 0 };

/** The project and client screens' API, answered from the fixtures. A test's own handlers go before these: the first match answers. */
export const projectHandlers = [
    http.get("/api/projects", () => HttpResponse.json(fixtures.projects)),
    http.get("/api/projects/totals", () => HttpResponse.json(fixtures.projectTotals)),
    http.get("/api/projects/:id", () => HttpResponse.json(fixtures.project)),
    http.get("/api/projects/:id/requirements", () => HttpResponse.json(fixtures.requirements)),
    http.get("/api/projects/:id/meetings", () => HttpResponse.json(fixtures.projectMeetings)),
    http.get("/api/meetings", () => HttpResponse.json(fixtures.meetings)),
    http.get("/api/clients", () => HttpResponse.json(fixtures.clients)),
    http.get("/api/clients/overview", () => HttpResponse.json(fixtures.clientOverview)),
    http.get("/api/clients/:id", () => HttpResponse.json(fixtures.client)),
    http.get("/api/employees", () => HttpResponse.json(empty)),
    http.get("/api/invoices", () => HttpResponse.json(empty)),
    http.get("/api/payments", () => HttpResponse.json(empty)),
    http.get("/api/finance/:domain/summary", () => HttpResponse.json(fixtures.financeSummary)),
    http.get("/api/finance/:domain/clients", () => HttpResponse.json(fixtures.financeClients)),
    http.get("/api/search", () => HttpResponse.json(fixtures.search)),
];
