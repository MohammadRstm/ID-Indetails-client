import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { money } from "@/shared/format/money";
import { boqProgress } from "@/test/fixtures/boqs";
import { site, siteHandlers } from "@/test/fixtures/site";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

// An Execution admin a super admin has handed the money to: admins don't hold it by default
const karim = withPermissions(personas.executionAdmin, { grant: MONEY_AND_HIRING });
const tarek = personas.executionEmployee;
const lobby = site.project;
/** The lobby with Tarek on its staff, as he reads it: no money. */
const tareksLobby = { ...lobby, money: null, staff: [{ id: tarek.id, name: "Tarek Nasser" }] };
const cents = (n: number) => money.exact(n, "USD", { cents: true });

const refusal = (status: number, code: string, message: string, errors: Record<string, string[]> | null) =>
    HttpResponse.json({ type: errors ? "validation" : "business_rule", code, message, errors, traceId: "t" }, { status });
/** Answers the progress with this, keeping the day each read asked for. */
const progressAnswering = (answer: () => Response, asked: (string | null)[] = []) =>
    http.get("/api/projects/:id/boqs/progress", ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("asOf"));
        return answer();
    });
const panel = () => screen.findByRole("region", { name: "Progress by value" });

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("a site's progress by value, for whoever sees its money", () => {
    it("sits in the BOQs part, with each line's quantity, what was executed, its progress and the values", async () => {
        renderApp(`/execution/projects/${lobby.id}?part=boqs`, karim, ...siteHandlers);
        const region = await panel();
        const figures = await within(region).findByRole("group", { name: "Site progress" });
        expect(figures).toHaveTextContent("29.8%");
        expect(figures).toHaveTextContent(cents(5070));
        expect(figures).toHaveTextContent(cents(17000));

        const table = within(region).getByRole("table", { name: "Executed quantities" });
        expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Line", "Unit", "Quantity", "Executed", "Progress", "Value executed"]);
        const demolition = within(table).getByRole("row", { name: "Demolition" });
        expect(demolition).toHaveTextContent("105");
        expect(within(demolition).getByText("100%")).toBeInTheDocument();
        expect(demolition).toHaveTextContent(cents(2100));
        const tiles = within(table).getByRole("row", { name: "Porcelain tiles" });
        expect(tiles).toHaveTextContent("198");
        expect(tiles).toHaveTextContent("99");
        expect(within(tiles).getByText("50%")).toBeInTheDocument();
        expect(within(table).getByRole("row", { name: "Electrical first fix" })).toHaveTextContent("Not recorded");

        // the latest records, newest first, with who recorded them
        const records = within(region).getByRole("list", { name: "Progress records" });
        expect(within(records).getAllByRole("listitem")[0]).toHaveTextContent("North wall tiled");
        expect(within(records).getAllByRole("listitem")[0]).toHaveTextContent("Tarek Nasser");
        // the pricing manager may record
        expect(within(region).getByRole("button", { name: "Record progress" })).toBeInTheDocument();
    });

    it("reads the quantities as they stood on the day picked", async () => {
        const asked: (string | null)[] = [];
        renderApp(`/execution/projects/${lobby.id}?part=boqs`, karim, progressAnswering(() => HttpResponse.json(boqProgress.full), asked), ...siteHandlers);
        const region = await panel();
        await within(region).findByRole("table", { name: "Executed quantities" });
        expect(asked).toEqual(["2026-09-30"]);
        const day = within(region).getByLabelText("As of");
        await userEvent.clear(day);
        await userEvent.type(day, "2026-09-21{Enter}");
        await waitFor(() => expect(asked).toContain("2026-09-21"));
        expect(asked.at(-1)).toBe("2026-09-21");
    });

    it("has no record button for someone who reads every site but neither manages its pricing nor oversees it", async () => {
        // an Execution admin by default: every site's logs, no BOQs part, so the progress is in the Site staff part
        renderApp(`/execution/projects/${lobby.id}?part=staff`, personas.executionAdmin,
            http.get("/api/projects/:id", () => HttpResponse.json({ ...lobby, money: null, staff: [{ id: 13, name: "Nour Aziz" }] })),
            progressAnswering(() => HttpResponse.json(boqProgress.quantities)), ...siteHandlers);
        const region = await panel();
        expect(await within(region).findByRole("table", { name: "Executed quantities" })).toBeInTheDocument();
        expect(within(region).queryByRole("button", { name: "Record progress" })).not.toBeInTheDocument();
    });

    it("isn't shown twice to someone who has the BOQs part", async () => {
        renderApp(`/execution/projects/${lobby.id}?part=staff`, karim, ...siteHandlers);
        expect(await screen.findByLabelText("Site staff")).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Progress by value" })).not.toBeInTheDocument();
    });
});

describe("recording a site's progress", () => {
    it("is for the site's own staff, under Site staff, with quantities and no money", async () => {
        renderApp(`/execution/projects/${lobby.id}?part=staff`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(tareksLobby)),
            progressAnswering(() => HttpResponse.json(boqProgress.quantities)), ...siteHandlers);
        const region = await panel();
        const table = await within(region).findByRole("table", { name: "Executed quantities" });
        expect(within(table).queryByRole("columnheader", { name: "Value executed" })).not.toBeInTheDocument();
        const figures = within(region).getByRole("group", { name: "Site progress" });
        expect(figures).toHaveTextContent("29.8%");
        expect(figures).not.toHaveTextContent("Agreed value");
        expect(figures).not.toHaveTextContent("Value executed");
        expect(region).not.toHaveTextContent("$");
        expect(within(region).getByRole("button", { name: "Record progress" })).toBeInTheDocument();
    });

    it("sends only the lines changed, as everything executed so far, with the day and the note", async () => {
        const sent: unknown[] = [];
        renderApp(`/execution/projects/${lobby.id}?part=staff`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(tareksLobby)),
            progressAnswering(() => HttpResponse.json(boqProgress.quantities)),
            http.put("/api/projects/:id/boqs/progress", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(boqProgress.quantities); }),
            ...siteHandlers);
        const region = await panel();
        await userEvent.click(await within(region).findByRole("button", { name: "Record progress" }));
        const dialog = await screen.findByRole("dialog", { name: "Record progress" });
        // each field starts at the quantity executed so far
        expect(within(dialog).getByLabelText(/Demolition/)).toHaveValue("105");
        expect(within(dialog).getByLabelText(/Electrical first fix/)).toHaveValue("");

        // nothing changed yet: saving says so, and sends nothing
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        expect(await within(dialog).findByText("Change the executed quantity of at least one line.")).toBeInTheDocument();

        await userEvent.type(within(dialog).getByLabelText(/Electrical first fix/), "0.5");
        await userEvent.type(within(dialog).getByLabelText("Note"), "First fix started");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{ recordedOn: "2026-09-30", lines: [{ boqLineId: 103, executedQuantity: 0.5, note: "First fix started" }] }]));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Record progress" })).not.toBeInTheDocument());
    });

    it("says what is wrong with a quantity as it is typed", async () => {
        renderApp(`/execution/projects/${lobby.id}?part=staff`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(tareksLobby)),
            progressAnswering(() => HttpResponse.json(boqProgress.quantities)), ...siteHandlers);
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Record progress" }));
        const dialog = await screen.findByRole("dialog", { name: "Record progress" });
        const tiles = within(dialog).getByLabelText(/Porcelain tiles/);
        await userEvent.clear(tiles);
        await userEvent.type(tiles, "abc");
        await userEvent.tab();
        expect(await within(dialog).findByText("Enter a number, like 12.5.")).toBeInTheDocument();
        // twice the line's 198 m² at most
        await userEvent.clear(tiles);
        await userEvent.type(tiles, "400");
        expect(await within(dialog).findByText("At most twice the line's quantity (396).")).toBeInTheDocument();
        await userEvent.clear(tiles);
        await userEvent.type(tiles, "150");
        expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the API's refusal of a line beside its field", async () => {
        const message = "Executed quantity can be at most twice the line's quantity.";
        renderApp(`/execution/projects/${lobby.id}?part=staff`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(tareksLobby)),
            progressAnswering(() => HttpResponse.json(boqProgress.quantities)),
            http.put("/api/projects/:id/boqs/progress", () => refusal(400, "validation_failed", "Some fields are invalid.", { "lines[0].executedQuantity": [message] })),
            ...siteHandlers);
        await userEvent.click(await within(await panel()).findByRole("button", { name: "Record progress" }));
        const dialog = await screen.findByRole("dialog", { name: "Record progress" });
        const electrical = within(dialog).getByLabelText(/Electrical first fix/);
        await userEvent.type(electrical, "1.5");
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
        // beside the field, once: not repeated in the foot
        const shown = await within(dialog).findByText(message);
        expect(electrical.closest(".field")).toContainElement(shown);
        expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
        expect(screen.getByRole("dialog", { name: "Record progress" })).toBeInTheDocument();
        // it goes as soon as something is changed
        await userEvent.type(electrical, "0");
        expect(within(dialog).queryByText(message)).not.toBeInTheDocument();
    });

    it("shows nothing to a staff member the API doesn't count on the site's team", async () => {
        const asked: (string | null)[] = [];
        renderApp(`/execution/projects/${lobby.id}?part=staff`, tarek, http.get("/api/projects/:id", () => HttpResponse.json(tareksLobby)),
            progressAnswering(() => refusal(403, "not_on_site_team", "You don't oversee this site.", null), asked), ...siteHandlers);
        expect(await screen.findByRole("form", { name: "Write a log" })).toBeInTheDocument();
        await waitFor(() => expect(asked).toHaveLength(1));
        await waitFor(() => expect(screen.queryByRole("region", { name: "Progress by value" })).not.toBeInTheDocument());
        expect(screen.queryByRole("button", { name: "Record progress" })).not.toBeInTheDocument();
    });

    it("isn't offered on a site someone else oversees", async () => {
        const asked: (string | null)[] = [];
        renderApp(`/execution/projects/${lobby.id}?part=staff`, tarek,
            http.get("/api/projects/:id", () => HttpResponse.json({ ...tareksLobby, staff: [{ id: 13, name: "Nour Aziz" }] })),
            progressAnswering(() => HttpResponse.json(boqProgress.quantities), asked), ...siteHandlers);
        expect(await screen.findByLabelText("Site staff")).toHaveTextContent("Nour Aziz");
        expect(screen.queryByRole("region", { name: "Progress by value" })).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });
});
