import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { STARTING_CATEGORIES, type CategoryDomain } from "@/domains/shared/finance/expenseCategoriesApi";

/**
 * The mock API every test talks to. Tests add their own handlers with `server.use(...)`, which come first. The few here
 * answer what many pages ask in passing: no month is reopened for logging unless a test says so, and each business has
 * the expense categories it started with.
 */
export const server = setupServer(
    http.get("/api/reopened-months", () => HttpResponse.json([])),
    http.get("/api/expense-categories", ({ request }) => {
        const domain = (new URL(request.url).searchParams.get("domain") ?? "design") as CategoryDomain;
        return HttpResponse.json((STARTING_CATEGORIES[domain] ?? []).map((c, i) => ({ id: i + 1, domain, code: c.value, name: c.label, sortOrder: i, removable: null })));
    }),
);
