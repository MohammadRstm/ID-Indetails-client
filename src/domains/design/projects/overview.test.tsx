import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/app/permissions/codes";
import { fmtH } from "@/shared/format/time";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// A Design admin a super admin has handed the money to: admins don't hold it by default
const admin = withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING });
const path = `/design/projects/${projectWork.project.id}`;
const sarah = projectWork.contributor.person;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const drawer = () => document.querySelector(".drawer") as HTMLElement;
const contributorsPanel = async () => (await screen.findByText("Who put the hours in. Click a person to see their entries on this project.")).closest(".panel") as HTMLElement;

describe("a Design project's overview", () => {
    it("shows the work KPIs and who put the hours in", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        expect(await screen.findByText(`avg ${"1h 55m"} per entry`)).toBeInTheDocument();
        const panel = await contributorsPanel();
        for (const c of projectWork.work.contributors) expect(await within(panel).findByText(c.name)).toBeInTheDocument();
        expect(within(panel).getByRole("columnheader", { name: "Labour cost" })).toBeInTheDocument();
        expect(within(panel).getByText(`${projectWork.work.contributors.length} contributors · ${projectWork.work.entryCount} entries · ${fmtH(projectWork.work.totalMinutes)}`)).toBeInTheDocument();
    });

    it("keeps labour cost and payment to people with financial:view", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] }), ...projectWorkHandlers);
        const panel = await contributorsPanel();
        await within(panel).findByText(projectWork.work.contributors[0].name);
        expect(within(panel).queryByRole("columnheader", { name: "Labour cost" })).toBeNull();
        expect(screen.queryByText("Payment status")).toBeNull();
    });

    it("shows a plain Design admin the work without any of the money", async () => {
        renderApp(path, personas.designAdmin, ...projectWorkHandlers);
        const panel = await contributorsPanel();
        await within(panel).findByText(projectWork.work.contributors[0].name);
        expect(within(panel).queryByRole("columnheader", { name: "Labour cost" })).toBeNull();
        expect(screen.queryByText("Payment status")).toBeNull();
        expect(screen.queryByText("Financial breakdown")).toBeNull();
        expect(within(document.querySelector(".page-head") as HTMLElement).queryByText(/^Payment/)).toBeNull();
    });

    it("shows only the progress without anyone's work, and never asks for everyone's", async () => {
        const asked: string[] = [];
        const refuse = (what: string) => () => { asked.push(what); return HttpResponse.json({ code: "forbidden" }, { status: 403 }); };
        renderApp(path, withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL, P.WORK_ENTRY_VIEW_OWN] }),
            http.get("/api/projects/:id/work", refuse("work")),
            http.get("/api/projects/:id/timeline", refuse("timeline")),
            http.get("/api/work-entries", refuse("entries")),
            ...projectWorkHandlers);
        await screen.findByRole("heading", { name: projectWork.project.title });
        expect(await screen.findByText("Progress")).toBeInTheDocument();
        expect(screen.queryByText("Contributors")).toBeNull();
        expect(screen.queryByText("Work timeline")).toBeNull();
        // the money that doesn't need everyone's work still shows
        expect(await screen.findByText("Financial breakdown")).toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("asks for a project's whole life 366 days at a time, as the API allows", async () => {
        const ranges: string[] = [];
        const old = { ...projectWork.project, createdAt: "2024-03-01T08:00:00Z", startDate: "2024-03-01" };
        renderApp(`${path}?tab=timeline`, admin,
            http.get("/api/projects/:id", () => HttpResponse.json(old)),
            http.get("/api/projects/:id/timeline/entries", ({ request }) => {
                const q = new URL(request.url).searchParams;
                ranges.push(`${q.get("from")}..${q.get("to")}`);
                return HttpResponse.json([]);
            }),
            ...projectWorkHandlers);
        await waitFor(() => expect(ranges).toEqual(["2024-02-23..2025-02-22", "2025-02-23..2026-02-23", "2026-02-24..2026-09-30"]));
        expect(screen.queryByText(/Couldn't load the project's history/)).toBeNull();
    });

    it("filters the contributors by range and work text through the API", async () => {
        const asked: URLSearchParams[] = [];
        renderApp(path, admin,
            http.get("/api/projects/:id/work", ({ request }) => {
                asked.push(new URL(request.url).searchParams);
                return HttpResponse.json(projectWork.work);
            }),
            ...projectWorkHandlers);
        await contributorsPanel();
        await userEvent.type(screen.getByPlaceholderText("Filter work text"), "lounge");
        await waitFor(() => expect(asked.some((q) => q.get("search") === "lounge")).toBe(true));
    });
});

describe("a contributor and their entries", () => {
    it("opens the person's work, then an entry, where admins can comment", async () => {
        let posted: Record<string, unknown> | null = null;
        renderApp(path, admin,
            http.post("/api/work-entries/:id/comments", async ({ request }) => {
                posted = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ id: 1, author: { id: admin.id, name: "Nadia Test", role: "admin" }, body: posted.body, sentToGroup: !!posted.sendToGroup, createdAt: "2026-09-30T09:00:00Z" });
            }),
            ...projectWorkHandlers);
        const panel = await contributorsPanel();
        await userEvent.click(await within(panel).findByText("62h 40m"));
        expect(await screen.findByText(`contribution to ${projectWork.project.title}`, { exact: false })).toBeInTheDocument();

        const first = projectWork.contributor.recentEntries[0];
        await userEvent.click((await within(drawer()).findAllByText(first.description))[0]);
        const dialog = await screen.findByRole("dialog", { name: "Work entry" });
        expect(await within(dialog).findByText("Work description")).toBeInTheDocument();

        await userEvent.type(within(dialog).getByLabelText("Add a comment"), "Looks good - add the joinery detail");
        await userEvent.click(within(dialog).getByRole("checkbox"));
        await userEvent.click(within(dialog).getByRole("button", { name: "Comment" }));
        await waitFor(() => expect(posted).toEqual({ body: "Looks good - add the joinery detail", sendToGroup: true }));
        expect(await screen.findByText("Comment added")).toBeInTheDocument();
    });

    it("shows the comments without the box to someone without work_entry:comment", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.WORK_ENTRY_COMMENT] }), ...projectWorkHandlers);
        const panel = await contributorsPanel();
        await userEvent.click(await within(panel).findByText("62h 40m"));
        const first = projectWork.contributor.recentEntries[0];
        await userEvent.click((await within(drawer()).findAllByText(first.description))[0]);
        const dialog = await screen.findByRole("dialog", { name: "Work entry" });
        expect(await within(dialog).findByText("No comments on this entry yet.")).toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Add a comment")).toBeNull();
    });
});

describe("the work timeline and analytics", () => {
    it("lists who worked, and shows a week's entries", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        const timeline = (await screen.findByText("Work timeline")).closest(".panel") as HTMLElement;
        expect(await within(timeline).findByText(sarah.name)).toBeInTheDocument();
        await userEvent.click(within(timeline).getByRole("tab", { name: "Week" }));
        expect((await within(timeline).findAllByText(projectWork.timelineEntries[0].description)).length).toBeGreaterThan(0);
        expect(timeline.querySelectorAll(".tl-chip")).toHaveLength(projectWork.timelineEntries.length);
    });

    it("hides a task's hover popup once it is clicked, even with the mouse still over it", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        const timeline = (await screen.findByText("Work timeline")).closest(".panel") as HTMLElement;
        await within(timeline).findByText(sarah.name);
        const day = await waitFor(() => {
            const seg = timeline.querySelector<HTMLElement>(".tl-seg:not(.h0)");
            expect(seg).not.toBeNull();
            return seg!;
        });
        const popup = document.getElementById("tip")!;
        fireEvent.mouseMove(day, { clientX: 200, clientY: 200 });
        expect(popup).toBeVisible();
        expect(popup).toHaveTextContent(sarah.name);

        // clicking zooms in and redraws the timeline under the mouse: no mouseleave ever comes
        await userEvent.click(day);
        expect(popup).not.toBeVisible();
    });

    it("opens the four charts on request", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Show analytics" }));
        for (const title of ["Hours per week", "Contribution share", "When work happens", "Cumulative hours vs plan"]) {
            expect(await screen.findByText(title)).toBeInTheDocument();
        }
    });
});
