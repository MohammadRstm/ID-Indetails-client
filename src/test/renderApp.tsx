import { render } from "@testing-library/react";
import { http, HttpResponse, type RequestHandler } from "msw";
import App from "@/App";
import type { CurrentUser } from "@/api/types";
import { tokenStore } from "@/api/tokenStore";
import { work } from "./fixtures/work";
import { server } from "./server";

/** Someone's own work when they have logged none: what an admin's projects page shows them unless a test says more. */
const nothingLogged = [
    http.get("/api/me/projects", () => HttpResponse.json([])),
    http.get("/api/me/work-summary", () => HttpResponse.json({
        ...work.summary, todayMinutes: 0, thisWeekMinutes: 0, lastWeekMinutes: 0, week: work.summary.week.map((d) => ({ ...d, minutes: 0 })),
    })),
    http.get("/api/me/day", ({ request }) => HttpResponse.json({
        ...work.day, date: new URL(request.url).searchParams.get("date"), entries: [], meetings: [], loggedMinutes: 0, overtimeMinutes: 0,
    })),
    http.get("/api/me/schedule", ({ request }) => HttpResponse.json({ ...work.schedule, day: { ...work.schedule.day, date: new URL(request.url).searchParams.get("date") } })),
    http.get("/api/me/overtime", () => HttpResponse.json({ ...work.overtime, overtimeMinutes: 0, madeUpMinutes: 0, paidMinutes: 0, entries: 0, days: [] })),
    http.get("/api/me/hours", () => HttpResponse.json({ ...work.hours, applies: false, months: [], totalMonths: 0 })),
    http.get("/api/domain-settings/:domain", () => HttpResponse.json(work.settings)),
];

/** The API calls every signed-in page makes (settings, branding, badges, counts), answered with calm defaults. */
export const shellHandlers = [
    http.get("/api/company/branding", () => HttpResponse.json({ name: "ID-Indetails", hasLogo: false })),
    http.get("/api/company/settings", () => HttpResponse.json({
        isSetUp: true, name: "ID-Indetails", address: null, website: null, logoFileId: null,
        timeZone: "Asia/Beirut", weekStart: 1, use24HourTime: false, defaultCurrency: "USD", updatedAt: null,
    })),
    http.get("/api/notifications/unread-count", () => HttpResponse.json({ unread: 0 })),
    http.get("/api/messages/badge", () => HttpResponse.json({ unread: 0, mention: false })),
    http.get("/api/projects", () => HttpResponse.json({ items: [], page: 1, pageSize: 1, totalCount: 7 })),
    http.get("/api/clients", () => HttpResponse.json({ items: [], page: 1, pageSize: 1, totalCount: 5 })),
    http.get("/api/employees", () => HttpResponse.json({ items: [], page: 1, pageSize: 1, totalCount: 9 })),
    http.get("/api/company/overview", () => HttpResponse.json({ netProfit: 12000, domains: [] })),
    ...nothingLogged,
];

/**
 * Renders the whole app at `path`, signed in as `user` (or signed out when null): the refresh cookie
 * "restores" that session, as it would in the browser. `handlers` answer the page's own calls, and win
 * over the shell's defaults.
 */
export function renderApp(path: string, user: CurrentUser | null, ...handlers: RequestHandler[]) {
    tokenStore.set(null);
    window.history.replaceState(null, "", path);
    server.use(
        ...shellHandlers,
        http.post("/api/auth/refresh", () => user
            ? HttpResponse.json({ accessToken: "test-token", accessTokenExpiresAt: "2030-01-01T00:00:00Z", user })
            : HttpResponse.json({ type: "authentication", code: "refresh_token_invalid", message: "No session." }, { status: 401 })),
        http.get("/api/auth/me", () => user
            ? HttpResponse.json(user)
            : HttpResponse.json({ type: "authentication", code: "unauthenticated", message: "Sign in." }, { status: 401 })),
    );
    // server.use puts the newest handlers first, so these win over the shell's.
    if (handlers.length) server.use(...handlers);
    return render(<App />);
}
