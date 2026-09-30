import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import projectPayMonthJson from "./companyPay/project-pay-month.json";
import projectPayWeekJson from "./companyPay/project-pay-week.json";
import schedulesJson from "./companyPay/schedules.json";
import { fixtures } from "./index";
import { work } from "./work";

/*
 * Project pay and schedules as Rana sees them, captured from the seeded development API: the week of Sep 28
 * and September 2026 across the six Design projects, and everyone's week (all on the company's 9 to 5).
 */

export const companyPay = {
    week: projectPayWeekJson as unknown as Schemas["ProjectPayResponse"],
    month: projectPayMonthJson as unknown as Schemas["ProjectPayResponse"],
    schedules: schedulesJson as unknown as Schemas["SchedulesResponse"],
};

export const companyPayHandlers = [
    http.get("/api/company/project-pay", ({ request }) =>
        HttpResponse.json(new URL(request.url).searchParams.get("unit") === "month" ? companyPay.month : companyPay.week)),
    http.get("/api/company/schedules", () => HttpResponse.json(companyPay.schedules)),
    http.get("/api/projects", () => HttpResponse.json(fixtures.projects)),
    http.get("/api/me/schedule", () => HttpResponse.json(work.schedule)),
];
