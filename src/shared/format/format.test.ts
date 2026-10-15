import { afterEach, describe, expect, it } from "vitest";
import { fmtBytes } from "./bytes";
import { money } from "./money";
import {
    addDays,
    compactNumber,
    companyTimeToUtc,
    dayKey,
    daysBetween,
    fmtDate,
    fmtDateY,
    fmtDayDate,
    fmtDur,
    fmtDurShort,
    fmtH,
    fmtMinutes,
    fmtMonthY,
    fmtRange,
    fmtTime,
    minutesOfDay,
    relDay,
    relTime,
    setFormatSettings,
    startOfWeek,
} from "./time";

afterEach(() => setFormatSettings({ timeZone: "Asia/Beirut", use24HourTime: false, weekStart: 1 }));

describe("dates and times", () => {
    it("shows instants in the company time zone and calendar days as they are", () => {
        // 21:30 UTC on 30 Sep is already 1 October in Beirut (UTC+3 in summer).
        const late = "2026-09-30T21:30:00Z";
        expect(dayKey(late)).toBe("2026-10-01");
        expect(fmtTime(late)).toBe("12:30 AM");
        expect(fmtDateY("2026-09-30")).toBe("Sep 30, 2026");
        expect(fmtDayDate("2026-09-30")).toBe("Wed, Sep 30");
    });

    it("follows the company's 24-hour setting", () => {
        setFormatSettings({ use24HourTime: true });
        expect(fmtRange("2026-09-30T06:00:00Z", "2026-09-30T08:15:00Z")).toBe("09:00 → 11:15");
        expect(fmtMinutes(13 * 60 + 5)).toBe("13:05");
    });

    it("turns a company wall-clock time into the UTC instant the API stores", () => {
        expect(companyTimeToUtc("2026-09-30", 9 * 60 + 30).toISOString()).toBe("2026-09-30T06:30:00.000Z");
        // Beirut is UTC+2 in winter.
        expect(companyTimeToUtc("2026-12-01", 9 * 60).toISOString()).toBe("2026-12-01T07:00:00.000Z");
        expect(minutesOfDay("2026-09-30T06:30:00Z")).toBe(9 * 60 + 30);
    });

    it("writes durations like the prototype", () => {
        expect(fmtDur(45)).toBe("45m");
        expect(fmtDur(65)).toBe("1h 05m");
        expect(fmtDurShort(120)).toBe("2h");
        expect(fmtH(7 * 60 + 30)).toBe("7h 30m");
        expect(fmtH(1240 * 60)).toBe("1,240h");
    });

    it("does calendar arithmetic on day keys", () => {
        expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
        expect(daysBetween("2026-09-28", "2026-10-02")).toBe(4);
        expect(startOfWeek("2026-09-30")).toBe("2026-09-28");
        setFormatSettings({ weekStart: 0 });
        expect(startOfWeek("2026-09-30")).toBe("2026-09-27");
        expect(fmtMonthY("2026-09")).toBe("September 2026");
        expect(fmtDate("2026-01-05")).toBe("Jan 5");
    });

    it("says how long ago something happened", () => {
        const now = new Date("2026-09-30T12:00:00Z");
        expect(relTime("2026-09-30T11:59:40Z", now)).toBe("just now");
        expect(relTime("2026-09-30T09:00:00Z", now)).toBe("3 hours ago");
        expect(relTime("2026-09-29T10:00:00Z", now)).toBe("yesterday");
        expect(relDay("2026-09-30T08:00:00Z", now)).toBe("Today");
        expect(relDay("2026-09-29T08:00:00Z", now)).toBe("Yesterday");
    });
});

describe("money", () => {
    it("is short on screen and exact in full", () => {
        expect(money.fmt(950)).toBe("$950");
        expect(money.fmt(9600)).toBe("$9.6k");
        expect(money.fmt(1_250_000)).toBe("$1.25M");
        expect(money.fmt(-4200)).toBe("−$4.2k");
        expect(money.fmt(2_600_000_000, "LBP")).toBe("2.6B LBP");
        expect(money.exact(12500)).toBe("$12,500");
        expect(money.exact(1250.5, "USD", { cents: true })).toBe("$1,250.5");
        expect(money.exact(-300, "USD", { paren: true })).toBe("($300)");
        expect(money.short(12_345)).toBe("$12k");
        expect(money.pct(0.125)).toBe("12.5%");
        expect(money.pct(null)).toBe("-");
    });

    it("moves to the next unit instead of writing 1000k", () => {
        expect(compactNumber(999_999)).toBe("1M");
    });
});

describe("file sizes", () => {
    it("counts in units of 1024, with a decimal from MB up", () => {
        expect(fmtBytes(0)).toBe("0 B");
        expect(fmtBytes(512)).toBe("512 B");
        expect(fmtBytes(38 * 1024)).toBe("38 KB");
        expect(fmtBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
        expect(fmtBytes(640 * 1024 ** 2)).toBe("640 MB");
        expect(fmtBytes(2.25 * 1024 ** 3)).toBe("2.3 GB");
        expect(fmtBytes(3 * 1024 ** 4)).toBe("3 TB");
    });

    it("moves to the next unit instead of writing 1,024", () => {
        expect(fmtBytes(1024)).toBe("1 KB");
        expect(fmtBytes(1024 * 1024 - 1)).toBe("1 MB");
        expect(fmtBytes(1024 ** 3 - 1)).toBe("1 GB");
        expect(fmtBytes(2048 * 1024 ** 4)).toBe("2,048 TB");
    });
});
