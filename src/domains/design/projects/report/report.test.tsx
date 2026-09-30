import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { billingHandlers } from "@/test/fixtures/billing";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const admin = personas.designAdmin;
const project = projectWork.project;
const path = `/design/projects/${project.id}`;
const handlers = [...billingHandlers, ...projectWorkHandlers];

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
    URL.createObjectURL = vi.fn(() => "blob:report");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

async function openReport() {
    await userEvent.click(await screen.findByRole("button", { name: "Export report" }));
    return screen.findByRole("dialog", { name: "Project report" });
}

describe("the project report", () => {
    it("previews the internal report, and the client summary without the internal sections", async () => {
        renderApp(path, admin, ...handlers);
        const dialog = await openReport();
        expect(within(dialog).getByText("Executive summary", { selector: "h3" })).toBeInTheDocument();
        expect(await within(dialog).findByText("Work and labour", { selector: "h3" })).toBeInTheDocument();
        expect(within(dialog).getByText(`project-${project.id}-report-2026-09-30.pdf · page 1`)).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("tab", { name: "Client" }));
        const summary = screen.getByRole("dialog", { name: "Client summary" });
        expect(within(summary).queryByText("Work and labour", { selector: "h3" })).not.toBeInTheDocument();
        expect(within(summary).queryByText("Financial summary", { selector: "h3" })).not.toBeInTheDocument();
        expect(within(summary).getByRole("switch", { name: "Work and labour" })).toBeDisabled();
        expect(within(summary).getAllByText("Internal only")).toHaveLength(3);
    });

    it("opens from a link, as the projects list's menu does, and closes back to the project", async () => {
        renderApp(`${path}?report=1`, admin, ...handlers);
        expect(await screen.findByRole("dialog", { name: "Project report" })).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Project report" })).toBeNull());
        expect(window.location.search).toBe("");
    });

    it("doesn't open from a link for someone the button isn't offered to", async () => {
        renderApp(`${path}?report=1`, withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...handlers);
        await screen.findByRole("heading", { name: project.title });
        expect(screen.queryByRole("dialog", { name: "Project report" })).toBeNull();
    });

    it("asks the server for the PDF with the type, range and sections picked", async () => {
        const asked: URLSearchParams[] = [];
        renderApp(path, admin,
            http.get(`/api/projects/${project.id}/report`, ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return new HttpResponse("%PDF", { headers: { "content-type": "application/pdf" } });
            }),
            ...handlers);
        const dialog = await openReport();
        await userEvent.click(within(dialog).getByRole("switch", { name: "Project expenses" }));
        await userEvent.click(within(dialog).getByRole("switch", { name: "Work-log appendix" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
        await waitFor(() => expect(asked).toHaveLength(1));
        expect(asked[0].get("kind")).toBe("internal");
        expect(asked[0].get("from")).toBe(project.startDate);
        expect(asked[0].get("to")).toBe("2026-09-30");
        expect(asked[0].getAll("sections")).toEqual(["summary", "info", "timeline", "work", "financials", "billing", "client", "log"]);
    });

    it("needs financial:view and work_entry:view_all", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...handlers);
        await screen.findByRole("heading", { name: project.title });
        expect(screen.queryByRole("button", { name: "Export report" })).not.toBeInTheDocument();
    });
});
