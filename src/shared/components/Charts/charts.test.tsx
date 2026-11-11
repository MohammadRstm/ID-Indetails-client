import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TipHost from "@/shared/components/Overlays/TipHost";
import { tip } from "@/shared/components/Overlays/tip";
import { CalendarHeat, HourHeat } from "./Heat";
import LineChart from "./LineChart";
import StackedColumns from "./StackedColumns";
import Waterfall from "./Waterfall";

// Regressions: these charts had no accessible name, and the tooltip a keyboard focus opens wasn't announced.
describe("charts for screen readers", () => {
    it("name a line chart by its title, or by its series", () => {
        const series = [{ label: "Revenue", points: [{ y: 1 }, { y: 2 }] }, { label: "Cost", points: [{ y: 1 }, { y: 1 }] }];
        const { rerender } = render(<LineChart series={series} title="Revenue and cost by month" />);
        expect(screen.getByRole("img", { name: "Revenue and cost by month" })).toBeInTheDocument();

        rerender(<LineChart series={series} />);
        expect(screen.getByRole("img", { name: "Line chart: Revenue, Cost" })).toBeInTheDocument();
    });

    it("name stacked columns by their title, or by their parts, and show each part in the legend", () => {
        const series = [{ label: "Materials", color: "var(--heat-4)" }, { label: "Fees", color: "var(--heat-1)" }];
        const data = [{ label: "Aug", values: [300, 100], total: 400 }, { label: "Sep", values: [0, 250], total: 250 }];
        const { container, rerender } = render(<StackedColumns series={series} data={data} title="Spending by category" />);
        expect(screen.getByRole("img", { name: "Spending by category" })).toBeInTheDocument();
        expect([...container.querySelectorAll(".legend span")].map((s) => s.textContent)).toEqual(["Materials", "Fees"]);
        // a part with nothing in a month draws nothing
        expect(container.querySelectorAll("path.mark")).toHaveLength(3);

        rerender(<StackedColumns series={series} data={data} />);
        expect(screen.getByRole("img", { name: "Stacked columns: Materials, Fees" })).toBeInTheDocument();
    });

    it("read a waterfall's steps out", () => {
        render(<Waterfall format={(v) => String(v)} steps={[
            { label: "Revenue", value: 5000, kind: "start" },
            { label: "Labour", value: 1500, kind: "cost" },
            { label: "Profit", value: 3500, kind: "result" },
        ]} />);
        expect(screen.getByRole("img", { name: "Profit waterfall: Revenue 5000, Labour -1500, Profit 3500" })).toBeInTheDocument();
    });

    it("summarise the heat maps", () => {
        render(<CalendarHeat value={(day) => (day === "2026-10-05" ? 90 : 0)} end="2026-10-11" weeks={2} />);
        expect(screen.getByRole("figure", { name: /^Work per day over 2 weeks: 1 days with work, the most on / })).toBeInTheDocument();

        const grid = Array.from({ length: 7 }, (_, day) => Array.from({ length: 24 }, (_, hour) => (day === 1 && hour === 10 ? 60 : 0)));
        render(<HourHeat grid={grid} />);
        expect(screen.getByRole("figure", { name: /When work happens, by weekday and hour: the most on/ })).toBeInTheDocument();
    });

    it("announce the tooltip politely, once per change", () => {
        render(<TipHost />);
        const region = screen.getByRole("status", { hidden: true });
        expect(region).toHaveAttribute("aria-live", "polite");

        tip.show({ clientX: 10, clientY: 10 }, [{ big: "Week of 5 Oct" }, { k: "Hours", v: "12.5" }]);
        expect(region).not.toHaveAttribute("hidden");
        expect(region).toHaveTextContent("Week of 5 OctHours12.5");
        const first = region.firstChild;

        // moving across the same bar doesn't refill it (and so isn't read out again)
        fireEvent.mouseMove(document.body);
        tip.show({ clientX: 12, clientY: 10 }, [{ big: "Week of 5 Oct" }, { k: "Hours", v: "12.5" }]);
        expect(region.firstChild).toBe(first);

        tip.show({ clientX: 30, clientY: 10 }, [{ big: "Week of 12 Oct" }, { k: "Hours", v: "8" }]);
        expect(region).toHaveTextContent("Week of 12 OctHours8");
        tip.hide();
        expect(region).toHaveAttribute("hidden");
    });
});
