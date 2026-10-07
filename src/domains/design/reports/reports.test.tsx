import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures } from "@/test/fixtures";
import { reportHandlers, reports } from "@/test/fixtures/reports";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const nadia = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });

// Wednesday 30 September 2026, noon in Beirut: the last day of Q3
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** Answers the report and remembers what each request asked for. */
function recordReport(asked: URLSearchParams[]) {
    return http.get("/api/reports/work", ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(reports.work);
    });
}
const range = (q: URLSearchParams | undefined) => `${q?.get("from")} to ${q?.get("to")}`;

describe("Reports", () => {
    it("adds up the quarter, and shows it by project, client and employee", async () => {
        renderApp("/design/reports", nadia, ...reportHandlers);
        expect(await screen.findByText("1,037")).toBeInTheDocument();
        expect(screen.getByText("Company-wide analysis · Q3 2026")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "By project 6" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Work entries 551" })).toBeInTheDocument();
        expect(screen.getAllByText("Haddad Holdings").length).toBeGreaterThan(0);
        expect(screen.getByText("Internal work")).toBeInTheDocument();
        expect(screen.getByText("No projects were completed in this period")).toBeInTheDocument();
    });

    it("asks for the period picked", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/reports", nadia, recordReport(asked), ...reportHandlers);
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-07-01 to 2026-09-30"));
        await userEvent.click(screen.getByRole("button", { name: "Q2" }));
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-04-01 to 2026-06-30"));
        // a quarter that hasn't started covers its first day, not a range ending before it begins
        await userEvent.click(screen.getByRole("button", { name: "Q4" }));
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-10-01 to 2026-10-01"));
        await userEvent.click(screen.getByRole("tab", { name: "Year" }));
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-01-01 to 2026-09-30"));
        await userEvent.click(screen.getByRole("tab", { name: "Last 30 days" }));
        await waitFor(() => expect(range(asked.at(-1))).toBe("2026-09-01 to 2026-09-30"));
    });

    it("narrows the report to a project and a person", async () => {
        const asked: URLSearchParams[] = [];
        const project = fixtures.projects.items[0];
        renderApp("/design/reports", nadia, recordReport(asked),
            http.get("/api/projects", () => HttpResponse.json(fixtures.projects)),
            ...reportHandlers);
        await screen.findByText("1,037");
        await userEvent.click(screen.getByRole("button", { name: "Project" }));
        await userEvent.click(screen.getByRole("option", { name: project.title }));
        await waitFor(() => expect(asked.at(-1)?.get("projectId")).toBe(String(project.id)));
        await userEvent.click(screen.getByRole("button", { name: "Employee" }));
        await userEvent.click(screen.getByRole("option", { name: "Yara Mansour" }));
        await waitFor(() => expect(asked.at(-1)?.get("userId")).toBe("9"));
        expect(screen.getByText(`Company-wide analysis · Q3 2026 · ${project.title} · Yara Mansour`)).toBeInTheDocument();
    });

    it("shows the money to people with financial:view", async () => {
        renderApp("/design/reports", nadia, ...reportHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Money" }));
        expect(await screen.findByText("Revenue against cost")).toBeInTheDocument();
        expect(screen.getByText("Client profit (all time)")).toBeInTheDocument();
    });

    it("keeps the money tab away without financial:view, and never asks for the months", async () => {
        let askedForMonths = false;
        renderApp("/design/reports", withPermissions(nadia, { revoke: [P.FINANCIAL_VIEW] }),
            http.get("/api/reports/work", () => HttpResponse.json({ ...reports.work, money: null })),
            http.get("/api/finance/design/monthly", () => { askedForMonths = true; return HttpResponse.json([]); }),
            ...reportHandlers);
        await screen.findByText("1,037");
        expect(screen.queryByRole("tab", { name: "Money" })).not.toBeInTheDocument();
        expect(askedForMonths).toBe(false);
    });

    it("lists and searches the entries", async () => {
        const searched: string[] = [];
        renderApp("/design/reports", nadia,
            http.get("/api/work-entries", ({ request }) => {
                searched.push(new URL(request.url).searchParams.get("search") ?? "");
                return HttpResponse.json(reports.entries);
            }),
            ...reportHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Work entries 551" }));
        expect(await screen.findByText(reports.entries.items[0].description)).toBeInTheDocument();
        await userEvent.type(screen.getByPlaceholderText("Search work, person or project"), "boards");
        await waitFor(() => expect(searched.at(-1)).toBe("boards"));
    });

    it("keeps everyone's entries and the export for work_entry:view_all", async () => {
        let askedForEntries = false;
        renderApp("/design/reports", withPermissions(nadia, { revoke: [P.WORK_ENTRY_VIEW_ALL] }),
            http.get("/api/work-entries", () => { askedForEntries = true; return HttpResponse.json(reports.entries); }),
            ...reportHandlers);
        await screen.findByText("1,037");
        expect(screen.queryByRole("tab", { name: /Work entries/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Employee" })).not.toBeInTheDocument();
        expect(askedForEntries).toBe(false);
    });

    it("exports the period's entries", async () => {
        const asked: URLSearchParams[] = [];
        URL.createObjectURL = vi.fn(() => "blob:report");
        URL.revokeObjectURL = vi.fn();
        renderApp("/design/reports", nadia,
            http.get("/api/work-entries/export", ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return new HttpResponse("Date,Hours\n", { headers: { "content-type": "text/csv" } });
            }),
            ...reportHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Export" }));
        await waitFor(() => expect(range(asked[0])).toBe("2026-07-01 to 2026-09-30"));
    });

    it("needs report:view", async () => {
        renderApp("/design/reports", withPermissions(nadia, { revoke: [P.REPORT_VIEW] }), ...reportHandlers);
        expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    });
});
