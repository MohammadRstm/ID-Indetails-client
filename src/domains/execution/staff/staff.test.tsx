import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { site, siteHandlers } from "@/test/fixtures/site";
import type { Schemas } from "@/api/types";
import recordsJson from "@/test/fixtures/site/siteRecords.json";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const records = recordsJson as unknown as Schemas["SiteRecordsResponse"];
const tarek = personas.executionEmployee;

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const sites = [
    { id: 30, title: "Mar Mikhael loft renovation", clientName: "Karam family", status: "active", location: "Mar Mikhael", assignedAt: "2026-09-01T08:00:00Z" },
    { id: 31, title: "Dbayeh marina villa", clientName: "Marina SAL", status: "hold", location: null, assignedAt: "2026-08-01T08:00:00Z" },
];
const log = (id: number, body: string, createdAt: string, canEdit = false, project = sites[0]) => ({
    id, project: { id: project.id, title: project.title }, person: { id: tarek.id, name: "Tarek Nasser" }, body, createdAt, updatedAt: null, canEdit,
});
const myLogs = [
    log(3, "The glue shipment is delayed until tomorrow.", "2026-09-30T14:00:00Z", true),
    log(2, "Concrete shipment arrived with 3 bags missing.", "2026-09-30T11:00:00Z", true),
    log(1, "Scaffolding up on the north side.", "2026-09-28T09:00:00Z", false, sites[1]),
];
const page = (items: unknown[]) => ({ items, page: 1, pageSize: 25, totalCount: items.length });

describe("a site staff member's daily log", () => {
    it("is their home, and keeps each log apart under its day, newest first", async () => {
        renderApp("/execution", tarek,
            http.get("/api/me/sites", () => HttpResponse.json(sites)),
            http.get("/api/me/site-logs", () => HttpResponse.json(page(myLogs))),
            ...siteHandlers);
        expect(await screen.findByRole("heading", { name: "Daily log" })).toBeInTheDocument();
        const today = await screen.findByRole("list", { name: "Logs of Wednesday, September 30, 2026" });
        expect(within(today).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
            expect.stringContaining("The glue shipment is delayed until tomorrow."),
            expect.stringContaining("Concrete shipment arrived with 3 bags missing."),
        ]);
        const earlier = screen.getByRole("list", { name: "Logs of Monday, September 28, 2026" });
        expect(earlier).toHaveTextContent("Dbayeh marina villa");
        // today's can still be changed, an earlier day's can't
        expect(within(today).getAllByRole("button", { name: "Edit" })).toHaveLength(2);
        expect(within(earlier).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        // no hours, no projects list, no meetings
        expect(screen.queryByRole("button", { name: "Log work" })).not.toBeInTheDocument();
    });

    it("writes a log for the site picked, saying what is missing first", async () => {
        const sent: unknown[] = [];
        renderApp("/execution/daily-log", tarek,
            http.get("/api/me/sites", () => HttpResponse.json(sites)),
            http.post("/api/projects/:id/site-logs", async ({ params, request }) => {
                sent.push({ projectId: Number(params.id), ...(await request.json() as object) });
                return HttpResponse.json(log(9, "Tiles delivered, two boxes cracked.", "2026-09-30T09:00:00Z", true, sites[1]), { status: 201 });
            }),
            ...siteHandlers);
        const form = await screen.findByRole("form", { name: "Write a log" });
        await userEvent.click(within(form).getByRole("button", { name: "Save log" }));
        expect(within(form).getByText("Say what happened.")).toBeInTheDocument();
        expect(sent).toEqual([]);
        await userEvent.click(within(form).getByLabelText("Site"));
        await userEvent.click(screen.getByRole("option", { name: "Dbayeh marina villa" }));
        await userEvent.type(within(form).getByLabelText("What happened?"), "  Tiles delivered, two boxes cracked.  ");
        await userEvent.click(within(form).getByRole("button", { name: "Save log" }));
        await waitFor(() => expect(sent).toEqual([{ projectId: 31, body: "Tiles delivered, two boxes cracked." }]));
        await waitFor(() => expect(within(form).getByLabelText("What happened?")).toHaveValue(""));
    });

    it("changes a log of today in place", async () => {
        const sent: unknown[] = [];
        renderApp("/execution/daily-log", tarek,
            http.get("/api/me/sites", () => HttpResponse.json(sites)),
            http.get("/api/me/site-logs", () => HttpResponse.json(page(myLogs))),
            http.put("/api/site-logs/:id", async ({ params, request }) => {
                sent.push({ id: Number(params.id), ...(await request.json() as object) });
                return HttpResponse.json({ ...myLogs[0], body: "The glue arrives on Friday." });
            }),
            ...siteHandlers);
        const today = await screen.findByRole("list", { name: "Logs of Wednesday, September 30, 2026" });
        await userEvent.click(within(today).getAllByRole("button", { name: "Edit" })[0]);
        const box = within(today).getByLabelText("Change the log");
        await userEvent.clear(box);
        await userEvent.type(box, "The glue arrives on Friday.");
        await userEvent.click(within(today).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{ id: 3, body: "The glue arrives on Friday." }]));
    });

    it("asks the API for the site, the days and the words picked", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/execution/daily-log", tarek,
            http.get("/api/me/sites", () => HttpResponse.json(sites)),
            http.get("/api/me/site-logs", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(page(myLogs)); }),
            ...siteHandlers);
        await screen.findByRole("list", { name: "Logs of Wednesday, September 30, 2026" });
        await userEvent.click(screen.getByLabelText("Filter by site"));
        await userEvent.click(screen.getByRole("option", { name: "Mar Mikhael loft renovation" }));
        await userEvent.type(screen.getByLabelText("Search the logs"), "glue");
        await waitFor(() => expect(asked.at(-1)?.get("search")).toBe("glue"));
        expect(asked.at(-1)?.get("projectId")).toBe("30");
    });

    it("keeps a closed site in the list, greyed out, since it takes no new logs", async () => {
        const closed = { id: 32, title: "Rawda Residences, Block A", clientName: null, status: "completed", location: null, assignedAt: "2026-07-01T08:00:00Z" };
        renderApp("/execution/daily-log", tarek,
            http.get("/api/me/sites", () => HttpResponse.json([...sites, closed])),
            http.get("/api/me/site-logs", () => HttpResponse.json(page([]))),
            ...siteHandlers);
        const form = await screen.findByRole("form", { name: "Write a log" });
        expect(within(form).getByText("Completed and archived sites take no new logs.")).toBeInTheDocument();
        await userEvent.click(within(form).getByLabelText("Site"));
        expect(screen.getByRole("option", { name: "Rawda Residences, Block A (completed)" })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("option", { name: "Mar Mikhael loft renovation" })).not.toHaveAttribute("aria-disabled", "true");
    });

    it("lists the sites they oversee, each opening its page", async () => {
        renderApp("/execution/sites", tarek, http.get("/api/me/sites", () => HttpResponse.json(sites)), ...siteHandlers);
        const list = await screen.findByRole("list", { name: "My sites" });
        const cards = within(list).getAllByRole("listitem");
        expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining("Mar Mikhael loft renovation"), expect.stringContaining("Dbayeh marina villa")]);
        expect(cards[1]).toHaveTextContent("On hold");
    });
});

describe("a site, for an Execution employee", () => {
    it("is their labour and their logs, without expenses or money", async () => {
        const noMoney = { ...site.losingProject, money: null, staff: [{ id: tarek.id, name: "Tarek Nasser" }] };
        renderApp(`/execution/projects/${noMoney.id}`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(noMoney)), ...siteHandlers);
        expect(await screen.findByText("Weekly labour")).toBeInTheDocument();
        expect(await screen.findByRole("form", { name: "Write a log" })).toBeInTheDocument();
        expect(within(screen.getByRole("form", { name: "Write a log" })).queryByLabelText("Site")).not.toBeInTheDocument();
        expect(screen.queryByText("Expenses", { selector: ".kpi-label" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add expenses" })).not.toBeInTheDocument();
        for (const text of ["Project money", "Client payments", "Charged to the client", "Client price", "Material profit", "Site expenses", "Ground labour and profit"]) {
            expect(screen.queryByText(text)).not.toBeInTheDocument();
        }
        expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    });

    it("takes no log from someone who doesn't oversee it", async () => {
        const notMine = { ...site.losingProject, money: null, staff: [{ id: 13, name: "Nour Aziz" }] };
        renderApp(`/execution/projects/${notMine.id}`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(notMine)), ...siteHandlers);
        expect(await screen.findByText("Weekly labour")).toBeInTheDocument();
        expect(screen.getByLabelText("Site staff")).toHaveTextContent("Nour Aziz");
        expect(screen.queryByRole("form", { name: "Write a log" })).not.toBeInTheDocument();
    });
});

describe("a site's staff and logs, for admins", () => {
    it("change who oversees the site, at least one", async () => {
        const sent: unknown[] = [];
        const withStaff = { ...site.project, staff: [{ id: 13, name: "Nour Aziz" }] };
        renderApp(`/execution/projects/${withStaff.id}?tab=overview`, personas.executionAdmin,
            http.get("/api/projects/:id", () => HttpResponse.json(withStaff)),
            http.put("/api/projects/:id/staff", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(withStaff); }),
            ...siteHandlers);
        const panel = await screen.findByLabelText("Site staff");
        await userEvent.click(within(panel).getByRole("button", { name: "Change" }));
        const dialog = await screen.findByRole("dialog", { name: "Site staff" });
        await userEvent.click(await within(dialog).findByRole("button", { name: /Nour Aziz/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(within(dialog).getByText("Choose at least one staff member to oversee the site.")).toBeInTheDocument();
        expect(sent).toEqual([]);
        await userEvent.click(within(dialog).getByRole("button", { name: /Tarek Nasser/ }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{ staffIds: [5] }]));
    });

    it("read every site's logs, by person", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/execution/site-logs", personas.executionAdmin,
            http.get("/api/site-logs", ({ request }) => { asked.push(new URL(request.url).searchParams); return HttpResponse.json(page(myLogs)); }),
            ...siteHandlers);
        expect(await screen.findByRole("heading", { name: "Daily logs" })).toBeInTheDocument();
        const today = await screen.findByRole("list", { name: "Logs of Wednesday, September 30, 2026" });
        expect(today).toHaveTextContent("Tarek Nasser");
        await userEvent.click(screen.getByLabelText("Filter by person"));
        await userEvent.click(await screen.findByRole("option", { name: "Nour Aziz" }));
        await waitFor(() => expect(asked.at(-1)?.get("userId")).toBe("13"));
    });
});

describe("an Execution person's profile", () => {
    it("shows what they recorded, and where", async () => {
        renderApp("/execution/profile", tarek, http.get("/api/me/site-records", () => HttpResponse.json(records)), ...siteHandlers);
        expect(await screen.findByText("Total recorded")).toBeInTheDocument();
        expect(await screen.findByText("expenses + labour weeks")).toBeInTheDocument();
        const recent = (screen.getByText("Recent activity")).closest(".panel") as HTMLElement;
        expect(within(recent).getByText("Plasterboard · Mar Mikhael loft renovation")).toBeInTheDocument();
        const projects = (screen.getAllByText("Projects").find((e) => e.classList.contains("panel-title")))!.closest(".panel") as HTMLElement;
        expect(within(projects).getByText("Mar Mikhael loft renovation")).toBeInTheDocument();
    });

    it("pages their recent activity, ten records at a time", async () => {
        const asked: (string | null)[] = [];
        renderApp("/execution/profile", tarek,
            http.get("/api/me/site-records", ({ request }) => {
                const q = new URL(request.url).searchParams;
                asked.push(`${q.get("recentPage")}/${q.get("recentPageSize")}`);
                return HttpResponse.json({ ...records, recentTotal: 23 });
            }),
            ...siteHandlers);
        const recent = await screen.findByLabelText("Recent activity");
        await waitFor(() => expect(asked).toEqual(["1/10"]));
        await userEvent.click(await within(recent).findByRole("button", { name: /next/i }));
        await waitFor(() => expect(asked.at(-1)).toBe("2/10"));
    });

    it("shows someone else's records to people with employee:view", async () => {
        const asked: string[] = [];
        const nour = { ...site.labourWeek.submittedBy, id: 13 };
        renderApp("/execution/people/13", personas.executionAdmin,
            http.get("/api/employees/:id", () => HttpResponse.json({
                id: nour.id, firstName: "Nour", lastName: "Aziz", email: "nour@id-indetails.test", phone: null, photoFileId: null, position: "Procurement officer",
                team: null, domain: "execution", role: "employee", status: "active", joinedOn: "2026-01-12", online: false, lastSeenAt: null, permissions: [],
            })),
            http.get("/api/employees/:id/site-records", ({ params }) => { asked.push(String(params.id)); return HttpResponse.json(records); }),
            ...siteHandlers);
        expect(await screen.findByText("since Jan 12, 2026")).toBeInTheDocument();
        expect(asked).toEqual(["13"]);
    });
});
