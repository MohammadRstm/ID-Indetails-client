import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const path = `/design/projects/${projectWork.project.id}?tab=timeline`;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const requirements = (total: number) =>
    http.get("/api/projects/:id/requirements", () => HttpResponse.json({ items: [], total, done: 0, overdue: 0, progressPct: 0 }));

describe("a project's Timeline tab", () => {
    it("shows this week as a calendar, with every task at its time", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        expect(await screen.findByText("Project history")).toBeInTheDocument();
        expect(screen.queryByText("The project at a moment")).toBeNull();
        expect(screen.getByRole("tab", { name: "Week", selected: true })).toBeInTheDocument();
        // the week of the 28th has Monday and Tuesday's work
        expect(await screen.findByRole("button", { name: "Open day Monday, September 28, 2026" })).toBeInTheDocument();
        expect(document.querySelectorAll(".hc-block:not(.mtg)").length).toBeGreaterThan(0);
    });

    it("draws progress over time only for a project with requirements", async () => {
        renderApp(path, personas.designAdmin, requirements(0), ...projectWorkHandlers);
        await screen.findByText("Project history");
        expect(screen.queryByText("Progress and status over time")).toBeNull();
    });

    it("draws progress over time once the project has requirements", async () => {
        renderApp(path, personas.designAdmin, requirements(3), ...projectWorkHandlers);
        expect(await screen.findByText("Progress and status over time")).toBeInTheDocument();
    });

    it("opens a day as cards", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Open day Monday, September 28, 2026" }));
        const dialog = await screen.findByRole("dialog", { name: "Monday, September 28, 2026" });
        expect(within(dialog).getByText("How the day moved")).toBeInTheDocument();
        expect(dialog.querySelectorAll(".ds-card").length).toBeGreaterThan(0);
    });

    it("shows a month as a grid, and a quarter as small months", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        await screen.findByText("Project history");
        await userEvent.click(screen.getByRole("tab", { name: "Month" }));
        expect(await screen.findByText("September 2026", { selector: "b" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Open day Monday, September 28, 2026" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: "Quarter" }));
        expect(await screen.findByText("Q3 2026")).toBeInTheDocument();
        for (const month of ["July 2026", "August 2026", "September 2026"]) expect(screen.getByText(month)).toBeInTheDocument();
    });

    it("goes to the very day asked for, not the start of its week", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        const field = await screen.findByLabelText("Go to a date");
        await userEvent.type(field, "Sep 29, 2026");
        await userEvent.tab();
        await userEvent.click(screen.getByRole("button", { name: "Go" }));
        expect(await screen.findByText("Tuesday, September 29, 2026", { selector: "b" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Open day Monday, September 28, 2026" })).toBeNull();
        expect(screen.getByRole("tab", { name: "Day", selected: true })).toBeInTheDocument();
    });

    it("is not there without work_entry:view_all", async () => {
        renderApp(path, withPermissions(personas.designAdmin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...projectWorkHandlers);
        await screen.findByRole("heading", { name: projectWork.project.title });
        expect(screen.queryByRole("tab", { name: "Timeline" })).toBeNull();
        expect(screen.queryByText("Project history")).toBeNull();
    });
});
