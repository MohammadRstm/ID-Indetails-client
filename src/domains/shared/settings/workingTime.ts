import type { Schemas } from "@/api/types";
import { addDays, DAYS, fmtDate, fmtH, fmtHourLabel, fmtMinutes } from "@/shared/format/time";
import type { WorkingTime, WorkingTimePolicy } from "./settingsApi";

/** The break is paid; it only lowers the hours required on a day longer than this (the API's WorkWeek). */
export const BREAK_AFTER = 360;
export const BREAKS = [0, 15, 30, 45, 60, 75, 90, 120];

export const requiredOf = (start: number, end: number, breakMinutes: number) => {
    const length = end - start;
    return length > BREAK_AFTER ? Math.max(0, length - breakMinutes) : length;
};

/** The days in the order the company's week runs. */
export const weekOrder = (weekStart: number) => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

/** "Mon–Fri" when the days run on without a gap, otherwise "Mon, Wed, Fri". */
export function daysText(days: number[], weekStart: number): string {
    const order = weekOrder(weekStart);
    const on = order.filter((d) => days.includes(d));
    if (!on.length) return "No working days";
    const idx = on.map((d) => order.indexOf(d));
    const run = idx.every((v, i) => !i || v === idx[i - 1] + 1);
    return run && on.length > 2 ? `${DAYS[on[0]]}–${DAYS[on[on.length - 1]]}` : on.map((d) => DAYS[d]).join(", ");
}

/** "9 AM", or "9:30 AM" when it isn't on the hour, as the prototype writes working hours. */
export const clock = (minutes: number) => (minutes % 60 ? fmtMinutes(minutes) : fmtHourLabel(minutes));

export const hoursText = (p: { startMinute: number; endMinute: number }) => `${clock(p.startMinute)} – ${clock(p.endMinute)}`;

/**
 * Where a change to the working time goes. Each change is a new version from a day on, so past months never
 * move; the API takes one change a day, so after one already made today the next applies from tomorrow. Every
 * change starts from the latest version, so changes made one after another add up.
 */
export function nextChange(wt: WorkingTime, today: string) {
    const latest: WorkingTimePolicy = wt.policies[0] ?? wt.current;
    const from = wt.policies.some((p) => p.effectiveFrom === today) ? addDays(today, 1) : today;
    const body = (patch: Partial<Schemas["SetWorkingTimeRequest"]>): Schemas["SetWorkingTimeRequest"] => ({
        workDays: latest.workDays, startMinute: latest.startMinute, endMinute: latest.endMinute,
        breakMinutes: latest.breakMinutes, overtimeMultiplier: latest.overtimeMultiplier, effectiveFrom: from, ...patch,
    });
    const when = from === today ? "Applies from today" : `A change already starts today, so this one applies from ${fmtDate(from)}`;
    return { latest, from, body, when };
}

export const breakText = (minutes: number) => (minutes ? fmtH(minutes) : "No break");
