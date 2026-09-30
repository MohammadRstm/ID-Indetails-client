import { addDays, addMonths, companyToday, daysBetween, fmtMonthY } from "./time";

/*
 * The ranges pages pick from (this quarter, this month, the last 30 days, a year), as the API's "yyyy-MM-dd"
 * days. One definition replaces the prototype's separate copies in each page.
 */

export type PeriodKind = "quarter" | "month" | "30d" | "year";

export type Period = {
    kind: PeriodKind;
    from: string;
    to: string;
    label: string;
    /** The same stretch just before, for comparisons. */
    prevFrom: string;
    prevTo: string;
    prevLabel: string;
};

export function quarterOf(day: string): { year: number; quarter: number } {
    const [y, m] = day.split("-").map(Number);
    return { year: y, quarter: Math.floor((m - 1) / 3) + 1 };
}

export function quarterStart(year: number, quarter: number): string {
    return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
}

export function quarterEnd(year: number, quarter: number): string {
    const next = quarter === 4 ? `${year + 1}-01-01` : quarterStart(year, quarter + 1);
    return addDays(next, -1);
}

export const quarterLabel = (year: number, quarter: number) => `Q${quarter} ${year}`;

export function periodRange(kind: PeriodKind, today = companyToday()): Period {
    if (kind === "month") {
        const from = `${today.slice(0, 7)}-01`;
        const prevFrom = `${addMonths(today.slice(0, 7), -1)}-01`;
        return { kind, from, to: today, label: fmtMonthY(today), prevFrom, prevTo: addDays(prevFrom, daysBetween(from, today)), prevLabel: "previous month" };
    }
    if (kind === "30d") {
        const from = addDays(today, -29);
        return { kind, from, to: today, label: "Last 30 days", prevFrom: addDays(from, -30), prevTo: addDays(today, -30), prevLabel: "previous 30 days" };
    }
    if (kind === "year") {
        const year = +today.slice(0, 4);
        const from = `${year}-01-01`;
        return { kind, from, to: today, label: String(year), prevFrom: `${year - 1}-01-01`, prevTo: addDays(`${year - 1}-01-01`, daysBetween(from, today)), prevLabel: String(year - 1) };
    }
    const { year, quarter } = quarterOf(today);
    const from = quarterStart(year, quarter);
    const prev = quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
    const prevFrom = quarterStart(prev.year, prev.quarter);
    return {
        kind,
        from,
        to: today,
        label: `${quarterLabel(year, quarter)} to date`,
        prevFrom,
        prevTo: addDays(prevFrom, daysBetween(from, today)),
        prevLabel: quarterLabel(prev.year, prev.quarter),
    };
}
