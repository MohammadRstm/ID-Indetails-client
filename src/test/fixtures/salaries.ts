import { http, HttpResponse } from "msw";
import type { Schemas } from "@/api/types";
import augustJson from "./salaries/august.json";
import omarAugustJson from "./salaries/omar-august.json";
import ramiSeptemberJson from "./salaries/rami-september.json";
import sarahOvertimeJson from "./salaries/sarah-overtime.json";
import sarahSeptemberJson from "./salaries/sarah-september.json";
import septemberPage2Json from "./salaries/september-2.json";
import septemberJson from "./salaries/september.json";
import tarekSeptemberJson from "./salaries/tarek-september.json";
import { work } from "./work";

/*
 * Salaries as Rana sees them, captured from the seeded development API: September 2026 in progress (13
 * people over two pages, two of them behind) and August closed (the seed has no August work, so every
 * Design employee finished it short). Details for Sarah (salaried, overtime that made up hours), Rami
 * (hourly, behind), Omar (salaried, August's shortfall deducted) and Tarek (Execution, hours not tracked).
 */

type Detail = Schemas["SalaryDetailResponse"];

export const salaries = {
    september: septemberJson as unknown as Schemas["SalariesResponse"],
    septemberPage2: septemberPage2Json as unknown as Schemas["SalariesResponse"],
    august: augustJson as unknown as Schemas["SalariesResponse"],
    sarah: sarahSeptemberJson as unknown as Detail,
    rami: ramiSeptemberJson as unknown as Detail,
    omar: omarAugustJson as unknown as Detail,
    tarek: tarekSeptemberJson as unknown as Detail,
    sarahOvertime: sarahOvertimeJson as unknown as Schemas["MyOvertimeResponse"],
};

type YearMonth = Schemas["SalaryYearMonthResponse"];
const monthsOf2026 = Array.from({ length: 9 }, (_, i) => `2026-0${i + 1}-01`);
const salaried = (month: string, total: number): YearMonth => ({ month, basis: "monthly", amount: 2000, currency: "USD", total });
const person = (userId: number, name: string, role: string, domain: string | null, months: YearMonth[]): Schemas["SalaryYearRowResponse"] =>
    ({ userId, name, email: `${name.split(" ")[0].toLowerCase()}@hourline.test`, role, domain, team: null, photoFileId: null, position: null, months });

/**
 * 2026 up to September: a designer on 2,000 a month (September 1,800, a day deducted), an admin paid from September, and
 * an Execution engineer paid in LBP in August.
 */
export const salaryYear: Schemas["SalaryYearResponse"] = {
    year: 2026,
    months: monthsOf2026,
    rows: [
        person(3, "Sarah Haddad", "employee", "design", monthsOf2026.map((m) => salaried(m, m === "2026-09-01" ? 1800 : 2000))),
        person(2, "Nadia Karam", "admin", "design", [{ month: "2026-09-01", basis: "monthly", amount: 2500, currency: "USD", total: 2500 }]),
        person(12, "Hiba Saleh", "employee", "execution", [{ month: "2026-08-01", basis: "monthly", amount: 45_000_000, currency: "LBP", total: 45_000_000 }]),
    ],
    totals: [
        ...monthsOf2026.map((month) => ({ month, currency: "USD", people: month === "2026-09-01" ? 2 : 1, total: month === "2026-09-01" ? 4300 : 2000 })),
        { month: "2026-08-01", currency: "LBP", people: 1, total: 45_000_000 },
    ],
};

const details: Record<string, Detail> = {
    "3:2026-09": salaries.sarah,
    "6:2026-09": salaries.rami,
    "4:2026-08": salaries.omar,
    "11:2026-09": salaries.tarek,
};

export const salaryHandlers = [
    http.get("/api/company/salaries", ({ request }) => {
        const q = new URL(request.url).searchParams;
        if (q.get("month") === "2026-08") return HttpResponse.json(salaries.august);
        return HttpResponse.json(q.get("page") === "2" ? salaries.septemberPage2 : salaries.september);
    }),
    http.get("/api/company/salaries/year", () => HttpResponse.json(salaryYear)),
    http.get("/api/company/salaries/:id", ({ params, request }) => {
        const detail = details[`${params.id}:${new URL(request.url).searchParams.get("month")}`];
        return detail ? HttpResponse.json(detail) : HttpResponse.json({ code: "not_found", message: "No salary for this person in that month." }, { status: 404 });
    }),
    http.get("/api/employees/:id/overtime", () => HttpResponse.json(salaries.sarahOvertime)),
    http.get("/api/me/schedule", () => HttpResponse.json(work.schedule)),
];
