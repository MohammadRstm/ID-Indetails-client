import { screen, waitFor, within } from "@testing-library/react";
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
const analytics = `${path}?tab=analytics`;
const contributorsTab = `${path}?tab=contributors`;
const contributorsText = "Who put the hours in. Click a person to see their entries on this project.";

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const drawer = () => document.querySelector(".drawer") as HTMLElement;
const contributorsPanel = async () => (await screen.findByText(contributorsText)).closest(".panel") as HTMLElement;

describe("a Design project's tabs", () => {
    it("opens on Financials for someone who sees money, with only the money on it", async () => {
        renderApp(path, admin, ...projectWorkHandlers);
        expect(await screen.findByRole("tab", { name: "Financials", selected: true })).toBeInTheDocument();
        expect(await screen.findByText("Financial breakdown")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Overview" })).toBeNull();
        expect(screen.queryByText(contributorsText)).toBeNull();
        expect(screen.queryByText("Work timeline")).toBeNull();
        expect(screen.getByRole("tab", { name: "Analytics" })).toBeInTheDocument();
    });

    it("shows the work KPIs on Analytics, and who put the hours in on Contributors", async () => {
        renderApp(analytics, admin, ...projectWorkHandlers);
        expect(await screen.findByText(`avg ${"1h 55m"} per entry`)).toBeInTheDocument();
        expect(screen.queryByText(contributorsText)).toBeNull();
        await userEvent.click(screen.getByRole("tab", { name: "Contributors" }));
        const panel = await contributorsPanel();
        for (const c of projectWork.work.contributors) expect(await within(panel).findByText(c.name)).toBeInTheDocument();
        expect(within(panel).getByRole("columnheader", { name: "Labour cost" })).toBeInTheDocument();
        expect(within(panel).getByText(`${projectWork.work.contributors.length} contributors · ${projectWork.work.entryCount} entries · ${fmtH(projectWork.work.totalMinutes)}`)).toBeInTheDocument();
    });

    it("keeps labour cost and payment to people with financial:view", async () => {
        renderApp(path, withPermissions(admin, { revoke: [P.FINANCIAL_VIEW] }), ...projectWorkHandlers);
        expect(await screen.findByRole("tab", { name: "Analytics", selected: true })).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Financials" })).toBeNull();
        await userEvent.click(screen.getByRole("tab", { name: "Contributors" }));
        const panel = await contributorsPanel();
        await within(panel).findByText(projectWork.work.contributors[0].name);
        expect(within(panel).queryByRole("columnheader", { name: "Labour cost" })).toBeNull();
        expect(screen.queryByText("Payment status")).toBeNull();
    });

    it("shows a plain Design admin the work without any of the money", async () => {
        renderApp(contributorsTab, personas.designAdmin, ...projectWorkHandlers);
        expect(screen.queryByRole("tab", { name: "Financials" })).toBeNull();
        const panel = await contributorsPanel();
        await within(panel).findByText(projectWork.work.contributors[0].name);
        expect(within(panel).queryByRole("columnheader", { name: "Labour cost" })).toBeNull();
        expect(screen.queryByText("Payment status")).toBeNull();
        expect(screen.queryByText("Financial breakdown")).toBeNull();
        expect(within(document.querySelector(".page-head") as HTMLElement).queryByText(/^Payment/)).toBeNull();
    });

    it("shows only the money without anyone's work, and never asks for everyone's", async () => {
        const asked: string[] = [];
        const refuse = (what: string) => () => { asked.push(what); return HttpResponse.json({ code: "forbidden" }, { status: 403 }); };
        renderApp(path, withPermissions(admin, { revoke: [P.WORK_ENTRY_VIEW_ALL, P.WORK_ENTRY_VIEW_OWN] }),
            http.get("/api/projects/:id/work", refuse("work")),
            http.get("/api/projects/:id/timeline", refuse("timeline")),
            http.get("/api/work-entries", refuse("entries")),
            ...projectWorkHandlers);
        await screen.findByRole("heading", { name: projectWork.project.title });
        expect(await screen.findByText("Financial breakdown")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Analytics" })).toBeNull();
        expect(screen.queryByText(contributorsText)).toBeNull();
        expect(asked).toEqual([]);
    });

    it("gives someone who sees neither money nor everyone's work an Overview with the progress", async () => {
        renderApp(path, withPermissions(personas.designAdmin, { revoke: [P.WORK_ENTRY_VIEW_ALL] }), ...projectWorkHandlers);
        expect(await screen.findByRole("tab", { name: "Overview", selected: true })).toBeInTheDocument();
        expect(await screen.findByText("Progress")).toBeInTheDocument();
        expect(screen.queryByText(contributorsText)).toBeNull();
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
        renderApp(contributorsTab, admin,
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
        renderApp(contributorsTab, admin,
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
        await userEvent.click(within(dialog).getByRole("checkbox", { name: /Also send to the/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Comment" }));
        await waitFor(() => expect(posted).toEqual({ body: "Looks good - add the joinery detail", sendToGroup: true }));
        expect(await screen.findByText("Comment added")).toBeInTheDocument();
    });

    it("lets an admin mark someone's entry as outside the original scope, from the entry", async () => {
        const sent: unknown[] = [];
        const first = projectWork.contributor.recentEntries[0];
        renderApp(contributorsTab, admin,
            http.put("/api/work-entries/:id/scope", async ({ params, request }) => {
                sent.push({ id: Number(params.id), ...(await request.json() as object) });
                return HttpResponse.json({ ...first, outsideScope: true });
            }),
            ...projectWorkHandlers);
        const panel = await contributorsPanel();
        await userEvent.click(await within(panel).findByText("62h 40m"));
        await userEvent.click((await within(drawer()).findAllByText(first.description))[0]);
        const dialog = await screen.findByRole("dialog", { name: "Work entry" });
        const scope = await within(dialog).findByRole("checkbox", { name: /Outside the original scope/ });
        expect(scope).not.toBeChecked();
        await userEvent.click(scope);
        await waitFor(() => expect(sent).toEqual([{ id: first.id, outsideScope: true }]));
    });

    it("shows how much of the work was outside the original scope, and whose", async () => {
        const [maya, ...rest] = projectWork.work.contributors;
        const work = {
            ...projectWork.work, outsideScopeMinutes: 270,
            contributors: [{ ...maya, outsideScopeMinutes: 270 }, ...rest.map((c) => ({ ...c, outsideScopeMinutes: 0 }))],
        };
        renderApp(analytics, admin, http.get("/api/projects/:id/work", () => HttpResponse.json(work)), ...projectWorkHandlers);
        // the strip shows its labels while it loads: wait for the figures
        const kpi = () => screen.getByText("Outside the scope").closest(".kpi") as HTMLElement;
        await waitFor(() => expect(kpi()).toHaveTextContent(fmtH(270)));
        expect(kpi()).toHaveTextContent(`${Math.round(270 / work.totalMinutes * 100)}% of the hours, asked for beyond what was agreed`);
        await userEvent.click(screen.getByRole("tab", { name: "Contributors" }));
        const panel = await contributorsPanel();
        expect(within(panel).getByRole("columnheader", { name: "Out of scope" })).toBeInTheDocument();
        const row = (await within(panel).findByText(maya.name)).closest("tr") as HTMLElement;
        expect(row).toHaveTextContent("4h 30m");
    });

    it("shows the comments without the box to someone without work_entry:comment", async () => {
        renderApp(contributorsTab, withPermissions(admin, { revoke: [P.WORK_ENTRY_COMMENT] }), ...projectWorkHandlers);
        const panel = await contributorsPanel();
        await userEvent.click(await within(panel).findByText("62h 40m"));
        const first = projectWork.contributor.recentEntries[0];
        await userEvent.click((await within(drawer()).findAllByText(first.description))[0]);
        const dialog = await screen.findByRole("dialog", { name: "Work entry" });
        expect(await within(dialog).findByText("No comments on this entry yet.")).toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Add a comment")).toBeNull();
    });
});

describe("the Analytics tab", () => {
    it("shows the four charts without asking", async () => {
        renderApp(analytics, admin, ...projectWorkHandlers);
        for (const title of ["Hours per week", "Contribution share", "When work happens", "Cumulative hours vs plan"]) {
            expect(await screen.findByText(title)).toBeInTheDocument();
        }
        expect(screen.queryByRole("button", { name: "Show analytics" })).toBeNull();
    });
});
