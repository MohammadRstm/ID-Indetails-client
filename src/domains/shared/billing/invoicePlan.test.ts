import { describe, expect, it } from "vitest";
import { planDays, splitEqually } from "./invoicePlan";

describe("Auto invoice's split", () => {
    it("splits to the cent, the last invoice taking what rounding leaves", () => {
        expect(splitEqually(10_000, 3)).toEqual([3333.33, 3333.33, 3333.34]);
        expect(splitEqually(18_200, 3)).toEqual([6066.66, 6066.66, 6066.68]);
        expect(splitEqually(100, 4)).toEqual([25, 25, 25, 25]);
        expect(splitEqually(0.05, 2)).toEqual([0.02, 0.03]);
    });

    it("lays the days out a week, two weeks or a month apart", () => {
        expect(planDays("2026-09-30", 3, "week")).toEqual(["2026-09-30", "2026-10-07", "2026-10-14"]);
        expect(planDays("2026-09-30", 2, "fortnight")).toEqual(["2026-09-30", "2026-10-14"]);
        // the 31st falls on a short month's last day, and the months after keep the 31st
        expect(planDays("2026-12-31", 4, "month")).toEqual(["2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
    });
});
