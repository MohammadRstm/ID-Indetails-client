import type { Schemas } from "@/api/types";
import { requiredOf } from "@/domains/shared/settings/workingTime";

/** A week as the editor holds it: each weekday (0 = Sunday) off, or its hours in minutes after midnight. */
export type Week = Record<number, { s: number; e: number } | null>;

export function weekOf(days: Schemas["ScheduleDayResponse"][]): Week {
    const week: Week = {};
    for (let d = 0; d < 7; d++) week[d] = null;
    for (const day of days) week[day.weekday] = { s: day.startMinute, e: day.endMinute };
    return week;
}

/** The company week: its working days, each with the same hours. */
export function companyWeekOf(policy: Schemas["WorkingTimePolicyResponse"]): Week {
    const week: Week = {};
    for (let d = 0; d < 7; d++) week[d] = policy.workDays.includes(d) ? { s: policy.startMinute, e: policy.endMinute } : null;
    return week;
}

/** Minutes the week requires: each day's hours less the paid break. */
export const weekMinutes = (week: Week, breakMinutes: number) =>
    Object.values(week).reduce((t, d) => t + (d ? requiredOf(d.s, d.e, breakMinutes) : 0), 0);

export const sameWeek = (a: Week, b: Week) =>
    Array.from({ length: 7 }, (_, d) => d).every((d) => (a[d]?.s ?? null) === (b[d]?.s ?? null) && (a[d]?.e ?? null) === (b[d]?.e ?? null));

export const workDaysOf = (week: Week) => Array.from({ length: 7 }, (_, d) => d).filter((d) => week[d]);
