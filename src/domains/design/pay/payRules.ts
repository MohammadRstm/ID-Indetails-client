import type { Schemas } from "@/api/types";

/*
 * The pay words the forms show, from the API's rules (PayRules). A salary is fixed: an hour of it is worth the salary
 * ÷ the month's paid hours, which the API works out month by month. Overtime is paid at a rate set with the pay
 * instead, the same every month: the salary ÷ 184 unless an admin types another.
 */

/** The hours a month the company counts for a salary's overtime rate. */
export const OVERTIME_HOURS = 184;

/**
 * The overtime rate a salary is given when none is typed, to the cent: what the forms suggest. The API stores the
 * same when the field is left out, and stays the authority.
 */
export const suggestedOvertimeRate = (salary: number) => Math.round((salary / OVERTIME_HOURS) * 100) / 100;

/** Admins and super admins are paid a fixed monthly salary: they log no hours. */
export const hasFixedSalary = (role: string) => role !== "employee";

/** Execution's site staff log no hours either, so they are paid by the month too (the API refuses an hourly pay). */
export const paidMonthlyOnly = (role: string, domain: string | null | undefined) => hasFixedSalary(role) || domain === "execution";

/** The pay in force on a day: the latest that has started. */
export function currentPay(history: Schemas["PayResponse"][] | undefined, today: string): Schemas["PayResponse"] | undefined {
    return (history ?? []).filter((p) => p.effectiveFrom <= today).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id)[0];
}
