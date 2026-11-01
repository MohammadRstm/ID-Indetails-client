import { afterEach, describe, expect, it, vi } from "vitest";

const KEY = "hourline-company-formats";

afterEach(() => localStorage.removeItem(KEY));

describe("The company's formats", () => {
    it("start as the last visit in this browser saw them, so the first page needn't wait for the settings", async () => {
        const london = { timeZone: "Europe/London", use24HourTime: true, weekStart: 0 };
        localStorage.setItem(KEY, JSON.stringify(london));
        vi.resetModules();
        const { formatsRemembered } = await import("./shellQueries");
        const { formatSettings } = await import("@/shared/format/time");
        expect(formatsRemembered).toBe(true);
        expect(formatSettings()).toEqual(london);
    });

    it("wait for the settings on a first visit", async () => {
        vi.resetModules();
        const { formatsRemembered } = await import("./shellQueries");
        expect(formatsRemembered).toBe(false);
    });
});
