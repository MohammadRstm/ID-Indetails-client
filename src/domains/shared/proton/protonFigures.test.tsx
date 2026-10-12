import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import ProtonBlocks from "./ProtonBlocks";
import type { ProtonReply } from "./protonApi";
import { formatChange, formatValue, parseBlocks, pointLabel, pointTitle, type ProtonBlock } from "./protonFigures";
import { voiceUpdatesOf } from "./protonVoice";

const source = { tool: "get_time_summary", dataset: "d3", asOf: "2026-10-12T09:05:00Z" };

const byPerson: ProtonBlock = {
    id: "b1-d3", type: "chart", title: "Hours by person", period: "1 Oct 2026 – 12 Oct 2026",
    chart: {
        kind: "bar", axisLabel: "Person", axis: "text",
        series: [{ key: "hours", label: "Hours", unit: "hours" }],
        points: [
            { label: "Anna", values: [12.5], ref: { type: "person", id: 4, name: "Anna" } },
            { label: "Ben", values: [6] },
            { label: "Carla", values: [null] },
        ],
    },
    table: null, kpis: null, notes: ["Shows 3 of 9 people."], source,
};

const projects: ProtonBlock = {
    id: "b2-d1", type: "table", title: "Projects", period: null, chart: null, kpis: null, notes: [], source,
    table: {
        columns: [{ key: "project", label: "Project", kind: "text" }, { key: "target", label: "Target date", kind: "date" }, { key: "revenue", label: "Revenue", kind: "number", unit: "usd" }],
        rows: Array.from({ length: 7 }, (_, i) => ({
            cells: [{ text: `Project ${i + 1}` }, { date: "2026-11-30" }, { number: 1000 * (i + 1) }],
            ref: { type: "project" as const, id: i + 1, name: `Project ${i + 1}`, domain: "design" },
        })),
        totalRows: 7,
    },
};

const linkOf = (ref: { type: string; id: number }) => `/design/projects/${ref.id}`;

const show = (blocks: ProtonBlock[], wide = false) =>
    render(<MemoryRouter><ProtonBlocks blocks={blocks} linkOf={linkOf} wide={wide} /></MemoryRouter>);

describe("Proton's charts and tables", () => {
    it("keep only the blocks whose shape can be drawn", () => {
        const tooMany = { ...byPerson, chart: { ...byPerson.chart!, points: Array.from({ length: 61 }, (_, i) => ({ label: `P${i}`, values: [i] })) } };
        const noChart = { ...byPerson, chart: null };
        const unknown = { ...byPerson, type: "pie" };

        expect(parseBlocks([byPerson, tooMany, noChart, unknown, "chart", null])).toEqual([byPerson]);
        expect(parseBlocks(undefined)).toEqual([]);
    });

    it("write each figure in its unit, and a missing one as a dash", () => {
        expect(formatValue("hours", 6.5)).toBe("6h 30m");
        expect(formatValue("percent", 40)).toBe("40%");
        expect(formatValue("days", 1)).toBe("1 day");
        expect(formatValue("count", 12)).toBe("12");
        expect(formatValue("usd", null)).toBe("–");
        expect(formatChange("hours", -2)).toBe("-2h");
        expect(formatChange("percent", 5)).toBe("+5 pts");
        expect(pointLabel("week", "2026-03-02")).toBe("Mar 2");
        expect(pointLabel("month", "2026-03-01")).toBe("Mar 2026");
        expect(pointTitle("week", "2026-03-02")).toBe("Week of Mar 2, 2026");
        expect(pointLabel("text", "Anna")).toBe("Anna");
    });

    it("show a chart small in the panel, leave a missing figure out, and open it in full", async () => {
        show([byPerson]);

        expect(screen.getByText("Hours by person")).toBeInTheDocument();
        expect(screen.getByText("Anna")).toBeInTheDocument();
        expect(screen.queryByText("Carla")).not.toBeInTheDocument();
        expect(screen.getByText("No figure for 1 of them.")).toBeInTheDocument();
        expect(screen.getByText("Shows 3 of 9 people.")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: 'Show "Hours by person" in full' }));

        const dialog = await screen.findByRole("dialog");
        // the figures as a table too, every point, a missing one as a dash
        const carla = within(dialog).getByRole("row", { name: /Carla/ });
        expect(within(carla).getByText("–")).toBeInTheDocument();
        expect(within(dialog).getByRole("row", { name: /Anna/ })).toHaveTextContent("12h 30m");
        expect(within(dialog).getByText(/From the app's own figures, read at/)).toBeInTheDocument();
    });

    it("show a few rows of a table in the panel and all of them, with links, in full", async () => {
        show([projects]);

        expect(screen.getAllByRole("row")).toHaveLength(6);
        expect(screen.getByText("2 more rows in the full view")).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: 'Show "Projects" in full' }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getAllByRole("row")).toHaveLength(8);
        expect(within(dialog).getByRole("link", { name: "Project 7" })).toHaveAttribute("href", "/design/projects/7");
        expect(within(dialog).getAllByText("Nov 30, 2026")).toHaveLength(7);
    });

    it("show headline figures with their change", () => {
        show([{
            id: "b1-d1", type: "kpis", title: "Hours compared", period: "1 Oct 2026 – 12 Oct 2026", chart: null, table: null, notes: [], source,
            kpis: { items: [{ key: "hours", label: "Hours", unit: "hours", value: 120, previous: 100, change: 20 }, { key: "people", label: "People", unit: "count", value: 6, previous: null, change: null }] },
        }]);

        expect(screen.getByText("120h")).toBeInTheDocument();
        expect(screen.getByText("+20h vs 100h")).toBeInTheDocument();
        expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("on a page, show a chart in full with its figures as a table", async () => {
        show([byPerson], true);

        expect(screen.queryByRole("button", { name: /in full/ })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Table" }));
        expect(screen.getByRole("row", { name: /Ben/ })).toHaveTextContent("6h");
    });

    it("tell the voice that a chart is on the screen, not to read it all out", () => {
        const reply = { reply: "Anna logged the most.", pendingActions: [], blocks: [byPerson] } as unknown as ProtonReply;
        const { know } = voiceUpdatesOf({ kind: "answer", reply });
        expect(know).toEqual(['On the person\'s screen now: "Hours by person". Say it\'s on screen; don\'t read out every figure in it.']);
    });
});
