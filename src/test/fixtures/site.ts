import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import { billing } from "./billing";
import invoicesJson from "./site/invoices.json";
import labourDefaultsJson from "./site/labourDefaults.json";
import labourWeekJson from "./site/labourWeek.json";
import labourWeekOpenJson from "./site/labourWeekOpen.json";
import labourWeeksJson from "./site/labourWeeks.json";
import losingProjectJson from "./site/losingProject.json";
import losingTimelineJson from "./site/losingTimeline.json";
import materialsJson from "./site/materials.json";
import openMaterialsJson from "./site/openMaterials.json";
import paymentsJson from "./site/payments.json";
import previewJson from "./site/preview.json";
import projectJson from "./site/project.json";
import requirementsJson from "./site/requirements.json";
import statementJson from "./site/statement.json";
import statementsJson from "./site/statements.json";
import timelineJson from "./site/timeline.json";

/*
 * Execution sites as Karim sees them, captured from the seeded development API on 30 September 2026.
 * Achrafieh Towers lobby (project 7): $10,000 received up front against $9,036 spent, one invoice sent,
 * four materials, all on its one client statement, and four weeks of ground labour; its profit reaches zero
 * on 8 October at six workers × $25. Mar Mikhael loft renovation (project 8) is losing money, and its four
 * materials are on no statement yet.
 */

export const site = {
    project: projectJson as unknown as Schemas["ProjectResponse"],
    materials: materialsJson as unknown as Schemas["MaterialListResponse"],
    labourWeeks: labourWeeksJson as unknown as Schemas["LabourWeekListResponse"],
    /** The week of 21 September, reported. */
    labourWeek: labourWeekJson as unknown as Schemas["LabourWeekResponse"],
    /** This week, not reported yet: filled in from the defaults up to today. */
    labourWeekOpen: labourWeekOpenJson as unknown as Schemas["LabourWeekResponse"],
    labourDefaults: labourDefaultsJson as unknown as Schemas["LabourDefaultsResponse"],
    timeline: timelineJson as unknown as Schemas["SiteMoneyTimelineResponse"],
    payments: paymentsJson as unknown as Paged<Schemas["PaymentResponse"]>,
    invoices: invoicesJson as unknown as Paged<Schemas["InvoiceSummaryResponse"]>,
    statements: statementsJson as unknown as Paged<Schemas["StatementSummaryResponse"]>,
    /** ST-2026-001, the lobby's statement of its four materials. */
    statement: statementJson as unknown as Schemas["StatementResponse"],
    /** The loft's four materials as a new statement would show them. */
    preview: previewJson as unknown as Schemas["StatementResponse"],
    requirements: requirementsJson as unknown as Schemas["RequirementListResponse"],
    losingProject: losingProjectJson as unknown as Schemas["ProjectResponse"],
    losingTimeline: losingTimelineJson as unknown as Schemas["SiteMoneyTimelineResponse"],
    openMaterials: openMaterialsJson as unknown as Schemas["MaterialListResponse"],
};

const losing = (id: unknown) => String(id) === String(site.losingProject.id);

export const siteHandlers = [
    http.get("/api/projects/totals", () => HttpResponse.json({})),
    http.get("/api/projects/:id", ({ params }) => HttpResponse.json(losing(params.id) ? site.losingProject : site.project)),
    http.get("/api/projects/:id/materials", ({ params }) => HttpResponse.json(losing(params.id) ? site.openMaterials : site.materials)),
    http.get("/api/projects/:id/labour-weeks", () => HttpResponse.json(site.labourWeeks)),
    http.get("/api/projects/:id/labour-weeks/:weekStart", ({ params }) =>
        HttpResponse.json(params.weekStart === site.labourWeek.weekStart ? site.labourWeek : site.labourWeekOpen)),
    http.get("/api/projects/:id/labour-defaults", () => HttpResponse.json(site.labourDefaults)),
    http.get("/api/projects/:id/site-money/timeline", ({ params }) => HttpResponse.json(losing(params.id) ? site.losingTimeline : site.timeline)),
    http.get("/api/projects/:id/statements", ({ params }) =>
        HttpResponse.json(losing(params.id) ? { items: [], page: 1, pageSize: 10, totalCount: 0 } : site.statements)),
    http.post("/api/projects/:id/statements/preview", () => HttpResponse.json(site.preview)),
    http.get("/api/statements/:id", () => HttpResponse.json(site.statement)),
    http.get("/api/projects/:id/requirements", () => HttpResponse.json(site.requirements)),
    http.get("/api/projects/:id/meetings", () => HttpResponse.json([])),
    http.get("/api/payments", () => HttpResponse.json(site.payments)),
    http.get("/api/invoices", () => HttpResponse.json(site.invoices)),
    http.get("/api/employees", () => HttpResponse.json({ items: [], page: 1, pageSize: 100, totalCount: 0 })),
    // a client with an email and a WhatsApp number, to send to
    http.get("/api/clients/:id", () => HttpResponse.json(billing.client)),
];
