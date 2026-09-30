import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import employeeJson from "./people/employee.json";
import entriesJson from "./people/entries.json";
import hoursJson from "./people/hours.json";
import labourCostJson from "./people/labourCost.json";
import overtimeJson from "./people/overtime.json";
import payHistoryJson from "./people/payHistory.json";
import peopleJson from "./people/people.json";
import summaryJson from "./people/summary.json";
import teamsJson from "./people/teams.json";
import { work } from "./work";

/*
 * Design's employees, captured from the seeded development API as Nadia (the Design admin): the list with
 * this week's work, and Yara Mansour's (id 9) record, work, cost and pay. Her hours balance was read as
 * Rana, the super admin, since salary:view is a company code.
 */

export const people = {
    list: peopleJson as unknown as Schemas["PersonWorkResponse"][],
    employee: employeeJson as unknown as Schemas["EmployeeResponse"],
    summary: summaryJson as unknown as Schemas["WorkSummaryResponse"],
    entries: entriesJson as unknown as Paged<Schemas["WorkEntryResponse"]>,
    labourCost: labourCostJson as unknown as Schemas["EmployeeLabourCostResponse"],
    payHistory: payHistoryJson as unknown as Schemas["PayResponse"][],
    overtime: overtimeJson as unknown as Schemas["MyOvertimeResponse"],
    hours: hoursJson as unknown as Schemas["MyHoursResponse"],
    teams: teamsJson as unknown as Schemas["TeamResponse"][],
};

export const peopleHandlers = [
    http.get("/api/work/people", () => HttpResponse.json(people.list)),
    http.get("/api/teams", () => HttpResponse.json(people.teams)),
    http.get("/api/employees/9", () => HttpResponse.json(people.employee)),
    http.get("/api/employees/9/work-summary", () => HttpResponse.json(people.summary)),
    http.get("/api/employees/9/labour-cost", () => HttpResponse.json(people.labourCost)),
    http.get("/api/employees/9/pay", () => HttpResponse.json(people.payHistory)),
    http.get("/api/employees/9/overtime", () => HttpResponse.json(people.overtime)),
    http.get("/api/employees/9/hours", () => HttpResponse.json(people.hours)),
    http.get("/api/work-entries", () => HttpResponse.json(people.entries)),
    http.get("/api/domain-settings/:domain", () => HttpResponse.json(work.settings)),
];
