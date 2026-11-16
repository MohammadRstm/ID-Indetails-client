import { screen, waitFor, within } from "@testing-library/react";
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

    it("edits and deletes an entry from the list, with Undo on the toast", async () => {
        const sent: string[] = [];
        const first = work.entries.items[0];
        renderApp("/design/my-work", sarah,
            http.delete("/api/work-entries/:id", ({ params }) => { sent.push(`delete ${params.id}`); return new HttpResponse(null, { status: 204 }); }),
            http.post("/api/work-entries/:id/restore", ({ params }) => { sent.push(`restore ${params.id}`); return HttpResponse.json(first); }),
            ...workHandlers);
        const row = () => screen.getAllByText(first.description).map((el) => el.closest(".entry")).find((el) => el != null) as HTMLElement;
        await screen.findAllByText(first.description);

        await userEvent.click(within(row()).getByRole("button", { name: "Entry actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Edit entry" }));
        expect(await screen.findByRole("dialog", { name: "Edit work entry" })).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit work entry" })).toBeNull());

        await userEvent.click(within(row()).getByRole("button", { name: "Entry actions" }));
        await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
        await waitFor(() => expect(sent).toEqual([`delete ${first.id}`]));
        const toast = (await screen.findByText("Entry deleted")).closest(".toast") as HTMLElement;
        await userEvent.click(within(toast).getByRole("button", { name: "Undo" }));
        await waitFor(() => expect(sent).toEqual([`delete ${first.id}`, `restore ${first.id}`]));
    });

    it("pages the profile's Recent work ten at a time, with Edit and Delete on each entry", async () => {
        const asked: string[] = [];
        renderApp("/design/profile", sarah,
            http.get("/api/me/work-entries", ({ request }) => {
                const q = new URL(request.url).searchParams;
                asked.push(`${q.get("page")}/${q.get("pageSize")}${q.get("from") ? ` ${q.get("from")}..${q.get("to")}` : ""}`);
                return HttpResponse.json({ ...work.entries, items: work.entries.items.slice(0, 10), totalCount: 25 });
            }),
            ...workHandlers);
        await waitFor(() => expect(asked).toContain("1/10"));
        expect((await screen.findAllByRole("button", { name: "Entry actions" })).length).toBeGreaterThan(0);
        expect(screen.getByText("Overtime", { selector: ".kpi-label" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "2" }));
        await waitFor(() => expect(asked).toContain("2/10"));

        // a day picked: that day's entries, from the first page
        await userEvent.type(screen.getByLabelText("Find a day"), "Sep 29, 2026");
        await userEvent.tab();
        await waitFor(() => expect(asked).toContain("1/10 2026-09-29..2026-09-29"));
        await userEvent.click(screen.getByRole("button", { name: "All days" }));
        await waitFor(() => expect(asked.at(-1)).toBe("1/10"));
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
        const closed = await screen.findByText(/August 2026 closed .* short\./);
        // the warning comes first, above the week
        expect(closed.compareDocumentPosition(await screen.findByText("Your week so far")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByText("Unless it's excused, the month stays marked short.", { exact: false })).toBeInTheDocument();
        expect(screen.queryByText(/salary/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /pay/i })).not.toBeInTheDocument();
        expect(screen.getByText("Hours balance")).toBeInTheDocument();
    });

    it("includes time off in the excused column's note", async () => {
        const [first, ...rest] = work.hours.months;
        const off = { requestId: 5, firstDay: "2026-09-14", lastDay: "2026-09-15", isPaid: true, days: ["2026-09-14", "2026-09-15"] };
        renderApp("/design/projects", sarah,
            http.get("/api/me/hours", () => HttpResponse.json({ ...work.hours, months: [{ ...first, timeOff: [off] }, ...rest] })),
            ...workHandlers);
        const toggle = await screen.findByRole("button", { name: /^Hours balance/ });
        // folded at first: this month's standing only
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(toggle.closest(".panel")!.querySelector("table")).toBeNull();
        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        const cell = toggle.closest(".panel")!.querySelector("td[title]");
        expect(cell).toHaveAttribute("title", expect.stringContaining("Time off Sep 14–Sep 15 · 2 days"));
    });
});
