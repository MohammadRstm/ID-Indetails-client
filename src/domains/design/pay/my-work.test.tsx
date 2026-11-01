import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDur } from "@/shared/format/time";
import { work, workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const sarah = personas.designEmployee;

// Wednesday 30 September 2026, noon in Beirut: after every entry in the fixtures
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("My work (Design)", () => {
    it("adds up their work and lists it day by day", async () => {
        renderApp("/design/my-work", sarah, ...workHandlers);
        expect(await screen.findByText(`avg ${fmtDur(work.summary.totalMinutes / work.summary.entryCount)}`)).toBeInTheDocument();
        expect(await screen.findByText(work.requirements.items[0].text)).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
        expect(screen.getAllByText(work.entries.items[0].description).length).toBeGreaterThan(0);
    });

    it("narrows the list to the project in the link", async () => {
        const asked: string[] = [];
        const projectId = work.entries.items[0].project.id;
        renderApp(`/design/my-work?project=${projectId}`, sarah,
            http.get("/api/me/work-entries", ({ request }) => {
                asked.push(new URL(request.url).searchParams.get("projectId") ?? "");
                return HttpResponse.json(work.entries);
            }),
            ...workHandlers);
        await waitFor(() => expect(asked).toContain(String(projectId)));
    });

    it("shows the week as a calendar", async () => {
        renderApp("/design/my-work", sarah, ...workHandlers);
        await userEvent.click(await screen.findByRole("tab", { name: "Week" }));
        expect(await screen.findByText("Week of Sep 28, 2026")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Previous week" }));
        expect(await screen.findByText("Week of Sep 21, 2026")).toBeInTheDocument();
    });
});

describe("the hours balance on the home page", () => {
    it("flags a month that closed short, and shows the balance", async () => {
        renderApp("/design/projects", sarah, ...workHandlers);
        // August closed short in the fixture: said in hours only, since employees don't see their pay
        expect(await screen.findByText(/August 2026 closed .* short\./)).toBeInTheDocument();
        expect(screen.getByText("Unless it's excused, the month stays marked short.", { exact: false })).toBeInTheDocument();
        expect(screen.queryByText(/salary/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
        expect(screen.getByText("Hours balance")).toBeInTheDocument();
    });
});
