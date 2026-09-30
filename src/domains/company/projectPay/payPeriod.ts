import { addDays, addMonths, fmtDate, fmtDateY, fmtMonthY, partsOf, startOfWeek } from "@/shared/format/time";

export type PayUnit = "week" | "month" | "quarter";

/** A period: from its first day, to the day after its last. */
export type PayPeriod = { from: string; to: string };

const quarterOf = (day: string) => Math.floor(partsOf(day).month / 3);

/** The week, month or quarter that holds a day (the prototype's periodOf). */
export function periodOf(unit: PayUnit, day: string): PayPeriod {
    if (unit === "week") {
        const from = startOfWeek(day);
        return { from, to: addDays(from, 7) };
    }
    const month = unit === "month" ? day.slice(0, 7) : `${day.slice(0, 4)}-${String(quarterOf(day) * 3 + 1).padStart(2, "0")}`;
    return { from: `${month}-01`, to: `${addMonths(month, unit === "month" ? 1 : 3)}-01` };
}

/** The period n steps before or after. */
export function stepPeriod(unit: PayUnit, period: PayPeriod, n: number): PayPeriod {
    if (unit === "week") return periodOf(unit, addDays(period.from, 7 * n));
    return periodOf(unit, `${addMonths(period.from.slice(0, 7), (unit === "month" ? 1 : 3) * n)}-01`);
}

/** "Week of Sep 21 – 27, 2026", "September 2026", "Q3 2026". */
export function periodLabel(unit: PayUnit, period: PayPeriod): string {
    const a = period.from, b = addDays(period.to, -1);
    if (unit === "month") return fmtMonthY(a);
    if (unit === "quarter") return `Q${quarterOf(a) + 1} ${a.slice(0, 4)}`;
    const span = a.slice(0, 4) !== b.slice(0, 4) ? `${fmtDateY(a)} – ${fmtDateY(b)}`
        : a.slice(0, 7) !== b.slice(0, 7) ? `${fmtDate(a)} – ${fmtDateY(b)}`
            : `${fmtDate(a)} – ${+b.slice(8)}, ${b.slice(0, 4)}`;
    return `Week of ${span}`;
}

/** "Jul 1 – Sep 30, 2026". */
export const periodDates = (period: PayPeriod) => `${fmtDate(period.from)} – ${fmtDateY(addDays(period.to, -1))}`;
