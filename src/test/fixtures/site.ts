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
import projectJson from "./site/project.json";
import requirementsJson from "./site/requirements.json";
import timelineJson from "./site/timeline.json";

/*
 * Execution sites as Karim sees them, captured from the seeded development API on 30 September 2026.
 * Achrafieh Towers lobby (project 7): $10,000 received up front against $9,036 spent, one invoice sent,
 * four materials and four weeks of ground labour; its profit reaches zero
 * on 8 October at six workers × $25. Mar Mikhael loft renovation (project 8) is losing money.
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
    requirements: requirementsJson as unknown as Schemas["RequirementListResponse"],
    losingProject: losingProjectJson as unknown as Schemas["ProjectResponse"],
    losingTimeline: losingTimelineJson as unknown as Schemas["SiteMoneyTimelineResponse"],
    openMaterials: openMaterialsJson as unknown as Schemas["MaterialListResponse"],
};

const losing = (id: unknown) => String(id) === String(site.losingProject.id);

/** Execution employees who can oversee a site: Tarek (the persona) and Nour. */
export const siteStaff = [
    { id: 5, firstName: "Tarek", lastName: "Nasser", email: "tarek@id-indetails.test", domain: "execution", role: "employee", status: "active" },
    { id: 13, firstName: "Nour", lastName: "Aziz", email: "nour@id-indetails.test", domain: "execution", role: "employee", status: "active" },
].map((p) => ({
    ...p, isJoker: false, joinedOn: "2026-01-12", lastSeenAt: null, leftOn: null, online: false, photoFileId: null, position: "Site engineer",
    sessionsRevokedAt: null, team: null,
})) as unknown as Schemas["EmployeeSummaryResponse"][];

export const siteHandlers = [
    http.get("/api/projects/totals", () => HttpResponse.json({})),
    http.get("/api/projects/:id", ({ params }) => HttpResponse.json(losing(params.id) ? site.losingProject : site.project)),
    http.get("/api/projects/:id/materials", ({ params }) => HttpResponse.json(losing(params.id) ? site.openMaterials : site.materials)),
    http.get("/api/projects/:id/labour-weeks", () => HttpResponse.json(site.labourWeeks)),
    http.get("/api/projects/:id/labour-weeks/:weekStart", ({ params }) =>
        HttpResponse.json(params.weekStart === site.labourWeek.weekStart ? site.labourWeek : site.labourWeekOpen)),
    http.get("/api/projects/:id/labour-defaults", () => HttpResponse.json(site.labourDefaults)),
    http.get("/api/projects/:id/site-money/timeline", ({ params }) => HttpResponse.json(losing(params.id) ? site.losingTimeline : site.timeline)),
    http.get("/api/projects/:id/requirements", () => HttpResponse.json(site.requirements)),
    http.get("/api/projects/:id/meetings", () => HttpResponse.json([])),
    http.get("/api/payments", () => HttpResponse.json(site.payments)),
    http.get("/api/invoices", () => HttpResponse.json(site.invoices)),
    // the Execution employees who can oversee a site; nobody else
    http.get("/api/employees", ({ request }) => {
        const items = new URL(request.url).searchParams.get("role") === "employee" ? siteStaff : [];
        return HttpResponse.json({ items, page: 1, pageSize: 100, totalCount: items.length });
    }),
    http.get("/api/me/sites", () => HttpResponse.json([])),
    http.get("/api/me/site-logs", () => HttpResponse.json({ items: [], page: 1, pageSize: 25, totalCount: 0 })),
    http.get("/api/site-logs", () => HttpResponse.json({ items: [], page: 1, pageSize: 25, totalCount: 0 })),
    // a client with an email and a WhatsApp number, to send to
    http.get("/api/clients/:id", () => HttpResponse.json(billing.client)),
];
