import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("a project's Timeline tab", () => {
    it("shows the project at a moment, over time and day by day", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        expect(await screen.findByText("The project at a moment")).toBeInTheDocument();
        expect(screen.getByText("Progress and status over time")).toBeInTheDocument();
        expect(screen.getByText("Project history")).toBeInTheDocument();
        // the week of the 28th has Monday and Tuesday's work
        expect(await screen.findByRole("heading", { name: "Monday" })).toBeInTheDocument();
    });

    it("jumps to the latest work and shows who was working then", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Latest work" }));
        const panel = screen.getByText("The project at a moment").closest(".panel") as HTMLElement;
        expect(within(panel).getByText("Working at this moment")).toBeInTheDocument();
        expect(within(panel).queryByText("This moment is in the future.")).toBeNull();
        expect(panel.querySelectorAll(".snap-work").length).toBeGreaterThan(0);
    });

    it("opens a day as cards", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        const open = await screen.findAllByRole("button", { name: /open day/i });
        await userEvent.click(open[0]);
        const dialog = await screen.findByRole("dialog", { name: "Monday, September 28, 2026" });
        expect(within(dialog).getByText("How the day moved")).toBeInTheDocument();
        expect(dialog.querySelectorAll(".ds-card").length).toBeGreaterThan(0);
    });

    it("is not there without work_entry:view_all", async () => {
        renderApp(path, withPermissions(personas.designAdmin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...projectWorkHandlers);
        await screen.findByRole("heading", { name: projectWork.project.title });
        expect(screen.queryByRole("tab", { name: "Timeline" })).toBeNull();
        expect(screen.queryByText("The project at a moment")).toBeNull();
    });
});
