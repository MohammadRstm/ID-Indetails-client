import { addDays, companyToday, daysBetween, fmtDate } from "@/shared/format/time";

/** Company-calendar days ("yyyy-MM-dd"), both inclusive. */
export type AnalyticsRange = { from: string; to: string };

export type RangeKey = "7d" | "28d" | "90d" | "custom";

export const PRESETS: { value: Exclude<RangeKey, "custom">; label: string; days: number }[] = [
    { value: "7d", label: "7 days", days: 7 },
    { value: "28d", label: "28 days", days: 28 },
    { value: "90d", label: "90 days", days: 90 },
];

/** The API asks Google for at most this many days. */
export const MAX_DAYS = 366;

/** Google Analytics 4 holds nothing earlier. */
export const FIRST_DAY = "2015-08-14";

/** The last few days ending yesterday, as Google Analytics shows them by default: today is still being counted. */
export function presetRange(days: number, today = companyToday()): AnalyticsRange {
    const to = addDays(today, -1);
    return { from: addDays(to, -(days - 1)), to };
}

/**
 * A custom period after one of its days was picked: the other day moves so the period still starts on or before it
 * ends, covers at most MAX_DAYS, and ends today at the latest.
 */
export function customRange(range: AnalyticsRange, changed: "from" | "to", day: string, today = companyToday()): AnalyticsRange {
    const latest = (a: string, b: string) => (a > b ? a : b);
    const earliest = (a: string, b: string) => (a < b ? a : b);
    if (changed === "from") {
        const from = earliest(latest(day, FIRST_DAY), today);
        const to = earliest(earliest(latest(range.to, from), addDays(from, MAX_DAYS - 1)), today);
        return { from, to };
    }
    const to = earliest(latest(day, FIRST_DAY), today);
    const from = latest(earliest(range.from, to), addDays(to, -(MAX_DAYS - 1)));
    return { from, to };
}

/** "Sep 23 – Oct 19", or one day. */
export function rangeLabel(range: AnalyticsRange): string {
    return range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
}

export const rangeDays = (range: AnalyticsRange) => daysBetween(range.from, range.to) + 1;
