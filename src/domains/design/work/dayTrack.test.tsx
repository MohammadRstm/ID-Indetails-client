import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DayTrack, { type TrackEntry } from "./DayTrack";

const entry = (id: number, tint: string | null): TrackEntry => ({
    id, s: 9 * 60 + id * 60, e: 10 * 60 + id * 60, description: `Task ${id}`, projectTitle: "Haddad Holdings HQ fit-out", tint,
    range: "", overtime: 0, locked: false,
});

describe("the day's timeline", () => {
    it("draws each logged entry in its project's colour, and one without a colour as before", () => {
        const { container } = render(<DayTrack lo={8 * 60} hi={18 * 60} workHours={null} entries={[entry(1, "#2F9E44"), entry(2, null)]} />);
        const [colored, plain] = Array.from(container.querySelectorAll<HTMLElement>("i.dt-e"));
        expect(colored).toHaveClass("pc");
        expect(colored.style.getPropertyValue("--pc")).toBe("#2F9E44");
        expect(colored.style.getPropertyValue("--pc-ink")).not.toBe("");
        expect(plain).not.toHaveClass("pc");
        expect(plain.style.getPropertyValue("--pc")).toBe("");
    });

    it("draws the time being logged in the colour of its project", () => {
        const { container } = render(<DayTrack lo={8 * 60} hi={18 * 60} workHours={null} entries={[]} sel={{ s: 9 * 60, e: 10 * 60 }} selTint="#8B5CF6" />);
        const sel = container.querySelector<HTMLElement>("i.dt-sel");
        expect(sel).toHaveClass("pc");
        expect(sel?.style.getPropertyValue("--pc")).toBe("#8B5CF6");
    });

    it("draws hours waiting for approval faded and locked, so nothing is dragged into their place", () => {
        const waiting: TrackEntry = { ...entry(1, null), id: -7, locked: true, pending: true };
        const { container } = render(<DayTrack lo={8 * 60} hi={18 * 60} workHours={null} entries={[waiting]} editable />);
        const box = container.querySelector<HTMLElement>("i.dt-e");
        expect(box).toHaveClass("pending");
        expect(box).toHaveClass("locked");
        expect(box).not.toHaveAttribute("data-eid");
    });
});
