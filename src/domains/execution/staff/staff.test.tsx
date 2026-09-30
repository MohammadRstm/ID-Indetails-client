import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Paged, Schemas } from "@/api/types";
import { site, siteHandlers } from "@/test/fixtures/site";
import activeJson from "@/test/fixtures/site/sitesActive.json";
import recordsJson from "@/test/fixtures/site/siteRecords.json";
import summariesJson from "@/test/fixtures/site/siteSummaries.json";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

/*
 * The seeded sites as Nour sees them: she recorded the loft's four materials this morning, and nothing on
 * the other two sites.
 */
const active = activeJson as unknown as Paged<Schemas["ProjectSummaryResponse"]>;
const summaries = summariesJson as unknown as Schemas["SiteSummaryResponse"][];
const records = recordsJson as unknown as Schemas["SiteRecordsResponse"];
const tarek = personas.executionEmployee;
const held = { ...active.items[2], status: "hold" as const };

const homeHandlers = [
    http.get("/api/projects", ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        const items = status === "active" ? active.items.slice(0, 2) : status === "hold" ? [held] : [];
        return HttpResponse.json({ items, page: 1, pageSize: 100, totalCount: items.length });
    }),
    http.get("/api/projects/site-summary", () => HttpResponse.json(summaries)),
];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("an Execution employee's projects", () => {
    it("say when what was recorded on them can't be loaded", async () => {
        renderApp("/execution/projects", tarek,
            http.get("/api/projects/site-summary", () => HttpResponse.json({ code: "forbidden", message: "You can't see that." }, { status: 403 })),
            ...homeHandlers);
        expect(await screen.findByText(/Couldn't load what has been recorded on your projects\./)).toBeInTheDocument();
        await screen.findAllByText("Mar Mikhael loft renovation");
        expect(screen.queryAllByText("…")).toHaveLength(0);
    });

    it("are the open sites, the one they last recorded on first, with what was recorded there", async () => {
        renderApp("/execution/projects", tarek, ...homeHandlers);
        expect(await screen.findByText("Good afternoon, Tarek")).toBeInTheDocument();
        const cards = await screen.findAllByText(/materials on record/);
        expect(cards).toHaveLength(3);
        const titles = [...document.querySelectorAll(".pcard-title")].map((t) => t.textContent);
        expect(titles).toEqual(["Mar Mikhael loft renovation", "Achrafieh Towers lobby", "Dbayeh marina villa"]);
        const loft = screen.getByText("Mar Mikhael loft renovation").closest(".pcard") as HTMLElement;
        expect(within(loft).getByText("$6.7k")).toBeInTheDocument();
        expect(within(loft).getByText(/you last recorded here/)).toBeInTheDocument();
        expect(within(loft).getByText(/site works, materials and ground labour/)).toBeInTheDocument();
        // the held site sits under Paused
        const paused = screen.getByText("Paused").parentElement as HTMLElement;
        expect(within(paused).getByText("Dbayeh marina villa")).toBeInTheDocument();
        expect(within(paused).getAllByText("On hold")).toHaveLength(2);
        // no hours anywhere
        expect(screen.queryByText("Your week so far")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Log work" })).not.toBeInTheDocument();
    });

    it("filter by the last time they recorded there", async () => {
        renderApp("/execution/projects", tarek, ...homeHandlers);
        await screen.findAllByText(/materials on record/);
        await userEvent.click(screen.getByLabelText("Last worked"));
        await userEvent.click(screen.getByRole("option", { name: "Never worked on" }));
        expect(await screen.findByText("2 of 3 projects")).toBeInTheDocument();
        expect(screen.queryByText("Mar Mikhael loft renovation")).not.toBeInTheDocument();
    });
});

describe("a site, for an Execution employee", () => {
    it("is built around what they record, and shows no money", async () => {
        const noMoney = { ...site.losingProject, money: null };
        renderApp(`/execution/projects/${noMoney.id}`, tarek,
            http.get("/api/projects/:id", () => HttpResponse.json(noMoney)),
            http.get("/api/projects/:id/materials", () => HttpResponse.json({
                ...site.openMaterials, defaultMarkup: null, all: { ...site.openMaterials.all, charge: null }, matching: { ...site.openMaterials.matching, charge: null },
                items: site.openMaterials.items.map((m) => ({ ...m, clientPrice: null, markup: null, priceSource: null })),
            })),
            ...siteHandlers);
        expect(await screen.findByText("Material cost so far")).toBeInTheDocument();
        expect(await screen.findByLabelText("Type 1")).toHaveValue("Plasterboard");
        expect(screen.getByText("Weekly labour")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add materials" })).toBeInTheDocument();
        for (const text of ["Project money", "Client payments", "Charged to the client", "Client price", "Material profit", "Ground labour and profit"]) {
            expect(screen.queryByText(text)).not.toBeInTheDocument();
        }
        expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    });
});

describe("an Execution person's profile", () => {
    it("shows what they recorded, and where", async () => {
        renderApp("/execution/profile", tarek, http.get("/api/me/site-records", () => HttpResponse.json(records)), ...siteHandlers);
        expect(await screen.findByText("Total recorded")).toBeInTheDocument();
        expect(await screen.findByText("materials + labour weeks")).toBeInTheDocument();
        const recent = (screen.getByText("Recent activity")).closest(".panel") as HTMLElement;
        expect(within(recent).getByText("Plasterboard · Mar Mikhael loft renovation")).toBeInTheDocument();
        const projects = (screen.getAllByText("Projects").find((e) => e.classList.contains("panel-title")))!.closest(".panel") as HTMLElement;
        expect(within(projects).getByText("Mar Mikhael loft renovation")).toBeInTheDocument();
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
